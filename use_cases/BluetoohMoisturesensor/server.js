const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Load configuration
const CARBYNESTACK_CONFIG = require('./carbynestack-config.js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─────────────────────────────────────────────────
//  Serial port configuration
//  Matches Arduino sketch: 115200 baud, CSV format
//  "Current_Reading,Dry_Ref,Wet_Ref"
// ─────────────────────────────────────────────────
const SERIAL_PORT_PATH = process.env.SERIAL_PORT || '/dev/rfcomm0'; // Bluetooth virtual COM port; override with env var if needed
const SERIAL_BAUD_RATE = 115200;

let serialPort = null;
let serialParser = null;
let isPollingActive = false;

// Latest values read from ESP32 serial
let latestESPData = {
    reading: null,
    value1: null,
    value2: null,
    lastUpdated: null
};

// Latest masked inputs — updated after each createSecret / MPC cycle
// These are the "shares" shown in the UI panels:
//   readingMasked     → Soil Reading Secret   (what model provider sees)
//   mpcResultMasked   → Irrigation Recommendation Secret (what model provider sees)
//   value1Masked      → Share of Decision Boundary 1  (what farmer sees)
//   value2Masked      → Share of Decision Boundary 2  (what farmer sees)
let latestMaskedInputs = {
    readingMasked:   null,   // masked input of current sensor reading
    mpcResultMasked: null,   // masked input of MPC result secret
    value1Masked:    null,   // masked input of dry-calibration secret
    value2Masked:    null,   // masked input of wet-calibration secret
};

// ─────────────────────────────────────────────────
//  Share-state store
// ─────────────────────────────────────────────────
let shareStateHistory = [];
let currentShareState = {
    player1Sent: null,
    player2Sent: null,
    player1Received: null,
    player2Received: null,
    mpcResult: null,
    timestamp: null
};

let calibrationHashesInitialized = false;

// ─────────────────────────────────────────────────
//  Validate configuration
// ─────────────────────────────────────────────────
function validateConfig() {
    const errors = [];

    if (!CARBYNESTACK_CONFIG.CS_JAR_PATH) {
        errors.push('CS_JAR_PATH is not configured');
    } else if (!fs.existsSync(CARBYNESTACK_CONFIG.CS_JAR_PATH)) {
        errors.push(`CS_JAR_PATH does not exist: ${CARBYNESTACK_CONFIG.CS_JAR_PATH}`);
    }

    if (CARBYNESTACK_CONFIG.CALIBRATION.value1 === null) {
        errors.push('CALIBRATION.value1 is not set');
    }

    if (CARBYNESTACK_CONFIG.CALIBRATION.value2 === null) {
        errors.push('CALIBRATION.value2 is not set');
    }

    return errors;
}

// ─────────────────────────────────────────────────
//  Execute shell command
// ─────────────────────────────────────────────────
function executeCommand(command, env) {
    return new Promise((resolve, reject) => {
        const timeout = CARBYNESTACK_CONFIG.TIMEOUT || 60000;
        console.log(`[CMD] ${command}`);
        exec(command, {
            env: env,
            shell: '/bin/bash',
            timeout: timeout
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[ERROR] ${error.message}`);
                console.error(`[STDERR] ${stderr}`);
                reject(error);
                return;
            }
            if (stderr) console.error(`[STDERR] ${stderr}`);
            console.log(`[STDOUT] ${stdout}`);
            resolve(stdout.trim());
        });
    });
}

// ─────────────────────────────────────────────────
//  Create Amphora secret
// ─────────────────────────────────────────────────
async function createSecret(value, env) {
    const accessPolicy = CARBYNESTACK_CONFIG.AMPHORA.ACCESS_POLICY;
    const authorizedPrograms = CARBYNESTACK_CONFIG.AMPHORA.AUTHORIZED_PROGRAMS;
    const command = `java -jar ${CARBYNESTACK_CONFIG.CS_JAR_PATH} amphora create-secret ${value} -t accessPolicy=${accessPolicy} -t authorizedPrograms=${authorizedPrograms}`;

    // Actual output format from cs.jar:
    //   ERROR StatusLogger Log4j2 could not find a logging implementation...
    //   masked_input: 190579139452070509456082724431451416351
    //   203a6f17-31c0-4957-b1b2-93f1cefbf953
    try {
        const output = await executeCommand(command, env);
        const lines = output.split('\n');
        let maskedInput = null;
        let hash = null;

        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            // Skip log4j / StatusLogger noise
            if (/StatusLogger|log4j|SimpleLogger|classpath/i.test(t)) continue;

            // masked_input: <bigint>
            const maskedMatch = t.match(/masked_input:\s*(\d+)/i);
            if (maskedMatch) { maskedInput = maskedMatch[1]; continue; }

            // Bare UUID on its own line — this is the secret hash
            const uuidMatch = t.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
            if (uuidMatch) { hash = uuidMatch[1]; continue; }
        }

        if (!hash) throw new Error(`No UUID found in create-secret output:\n${output}`);

        console.log(`[SECRET] value=${value}  masked=${maskedInput}  hash=${hash}`);
        return { hash, maskedInput };
    } catch (error) {
        throw new Error(`Failed to create secret: ${error.message}`);
    }
}

// ─────────────────────────────────────────────────
//  Initialize calibration secrets
// ─────────────────────────────────────────────────
async function initializeCalibrationSecrets(env) {
    if (calibrationHashesInitialized &&
        CARBYNESTACK_CONFIG.CALIBRATION.value1Hash &&
        CARBYNESTACK_CONFIG.CALIBRATION.value2Hash) {
        console.log('[INIT] Calibration secrets already initialized');
        return;
    }

    console.log('[INIT] Initializing calibration secrets...');

    try {
        if (!CARBYNESTACK_CONFIG.CALIBRATION.value1Hash) {
            console.log('[INIT] Creating secret for value1 (dry air)...');
            const { hash: value1Hash, maskedInput: value1sharesecret } = await createSecret(CARBYNESTACK_CONFIG.CALIBRATION.value1, env);
            CARBYNESTACK_CONFIG.CALIBRATION.value1Hash = value1Hash;
            CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret = value1sharesecret;
            // Expose to UI immediately
            latestMaskedInputs.value1Masked = value1sharesecret;
            console.log(`[INIT] Value1 hash: ${value1Hash}, masked: ${value1sharesecret}`);
        } else if (CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret) {
            // Already initialised — restore into latestMaskedInputs
            latestMaskedInputs.value1Masked = CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret;
        }

        if (!CARBYNESTACK_CONFIG.CALIBRATION.value2Hash) {
            console.log('[INIT] Creating secret for value2 (water)...');
            const { hash: value2Hash, maskedInput: value2sharesecret } = await createSecret(CARBYNESTACK_CONFIG.CALIBRATION.value2, env);
            CARBYNESTACK_CONFIG.CALIBRATION.value2Hash = value2Hash;
            CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret = value2sharesecret;
            // Expose to UI immediately
            latestMaskedInputs.value2Masked = value2sharesecret;
            console.log(`[INIT] Value2 hash: ${value2Hash}, masked: ${value2sharesecret}`);
        } else if (CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret) {
            // Already initialised — restore into latestMaskedInputs
            latestMaskedInputs.value2Masked = CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret;
        }

        calibrationHashesInitialized = true;
        await updateConfigFile();
        console.log('[INIT] ✅ Calibration secrets initialized successfully');
    } catch (error) {
        throw new Error(`Failed to initialize calibration secrets: ${error.message}`);
    }
}

// ─────────────────────────────────────────────────
//  Update config file
// ─────────────────────────────────────────────────
async function updateConfigFile() {
    try {
        const configPath = path.join(__dirname, 'carbynestack-config.js');
        let configContent = fs.readFileSync(configPath, 'utf8');

        // Persist hashes
        configContent = configContent.replace(/value1Hash:\s*null/, `value1Hash: '${CARBYNESTACK_CONFIG.CALIBRATION.value1Hash}'`);
        configContent = configContent.replace(/value2Hash:\s*null/, `value2Hash: '${CARBYNESTACK_CONFIG.CALIBRATION.value2Hash}'`);

        // Persist masked inputs (sharesecrets) — so they survive server restarts
        if (CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret) {
            // Replace existing value or null placeholder
            if (/value1sharesecret:\s*null/.test(configContent)) {
                configContent = configContent.replace(/value1sharesecret:\s*null/, `value1sharesecret: '${CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret}'`);
            } else if (!/value1sharesecret:/.test(configContent)) {
                // Field doesn't exist yet — inject it after value1Hash line
                configContent = configContent.replace(
                    /(value1Hash:\s*'[^']*')/,
                    `$1,\n        value1sharesecret: '${CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret}'`
                );
            }
        }
        if (CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret) {
            if (/value2sharesecret:\s*null/.test(configContent)) {
                configContent = configContent.replace(/value2sharesecret:\s*null/, `value2sharesecret: '${CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret}'`);
            } else if (!/value2sharesecret:/.test(configContent)) {
                configContent = configContent.replace(
                    /(value2Hash:\s*'[^']*')/,
                    `$1,\n        value2sharesecret: '${CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret}'`
                );
            }
        }

        fs.writeFileSync(configPath, configContent);
        console.log('[CONFIG] Updated config file with calibration hashes and masked inputs');
    } catch (error) {
        console.error('[CONFIG] Warning: Could not update config file:', error.message);
    }
}

// ─────────────────────────────────────────────────
//  Execute MPC
//  Returns the full raw output — including any masked_input: line —
//  so that runMPCForReading can extract both the UUID and the masked input.
//  The old  | tail -n +2 | sed …  pipeline was stripping the masked_input line.
// ─────────────────────────────────────────────────
async function executeMPC(readingHash, value1Hash, value2Hash, env) {
    const mpcFile = CARBYNESTACK_CONFIG.MPC_FILE_PATH;
    const jarPath = CARBYNESTACK_CONFIG.CS_JAR_PATH;
    const program = CARBYNESTACK_CONFIG.EPHEMERAL.PROGRAM;
    // Do NOT pipe through tail/sed — we need the full output to parse masked_input
    const command = `cat ${mpcFile} | java -jar ${jarPath} ephemeral execute -i ${readingHash} -i ${value1Hash} -i ${value2Hash} ${program}`;

    try {
        return await executeCommand(command, env);
    } catch (error) {
        throw new Error(`MPC execution failed: ${error.message}`);
    }
}

// ─────────────────────────────────────────────────
//  Parse MPC output
//  Handles raw full output which may contain:
//    - Log4j2 / StatusLogger warning lines (contain "ERROR" or "StatusLogger")
//    - masked_input: <bigint> lines
//    - UUID lines
//    - The actual result line: [val, val, val] or  val val val
// ─────────────────────────────────────────────────
function parseMPCOutput(rawOutput) {
    try {
        const lines = rawOutput.trim().split('\n');

        // Find the first line that looks like a numeric result —
        // skip log4j noise, masked_input lines, UUID lines, and empty lines.
        let resultLine = null;
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            if (/masked_input:/i.test(t)) continue;
            if (/output_share:/i.test(t)) continue;
            if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(t)) continue;
            if (/StatusLogger|log4j|SimpleLogger|classpath/i.test(t)) continue;
            // Skip metadata lines like 'owner -> ...' or 'accessPolicy -> ...'
            if (/\w+\s*->\s*/.test(t)) continue;
            // Must contain at least one digit
            if (!/\d/.test(t)) continue;
            resultLine = t;
            break;
        }

        if (!resultLine) throw new Error('No numeric result line found in MPC output');

        console.log(`[PARSE] Raw result line: ${resultLine}`);

        // Strip any brackets and split on whitespace/comma
        const cleanedLine = resultLine.replace(/[\[\]]/g, '').trim();
        const values = cleanedLine.split(/[\s,]+/).filter(v => v.length > 0);

        if (values.length !== 3) throw new Error(`Expected 3 values, got ${values.length}: "${cleanedLine}"`);

        console.log(`[PARSE] Cleaned values: [${values[0]}, ${values[1]}, ${values[2]}]`);

        let result = [0, 0, 0];
        if (values[0] === values[1]) {
            result = [0, 0, 1];
            console.log(`[PARSE] Pattern: values[0] == values[1] → [0, 0, 1] (WET)`);
        } else if (values[0] === values[2]) {
            result = [0, 1, 0];
            console.log(`[PARSE] Pattern: values[0] == values[2] → [0, 1, 0] (MODERATE)`);
        } else if (values[1] === values[2]) {
            result = [1, 0, 0];
            console.log(`[PARSE] Pattern: values[1] == values[2] → [1, 0, 0] (DRY)`);
        } else {
            console.log(`[PARSE] WARNING: All three values different - defaulting to [1, 0, 0] (DRY)`);
            result = [1, 0, 0];
        }

        console.log(`[PARSE] Final binary values: [${result.join(', ')}]`);
        return result.join(' ');
    } catch (error) {
        console.error('[PARSE] Error parsing MPC output:', error.message);
        throw new Error(`Failed to parse MPC output: ${error.message}`);
    }
}

// ═════════════════════════════════════════════════
//  Serial communication logic
//
//  Arduino sketch sends CSV lines every 500 ms:
//    "Current_Reading,Dry_Ref,Wet_Ref"   ← header (first line, skip)
//    "1843,2200,1100"                     ← data lines
//
//  The sketch sends calibration in setup() so
//  value1/value2 are stable from the first data line.
// ═════════════════════════════════════════════════

let mpcRunning = false; // debounce — prevent overlapping MPC calls
let headerSkipped = false; // skip the CSV header line on (re)connect

/**
 * Parse one line from the ESP32 Bluetooth stream.
 * ESP32 sends:  "DATA:<reading>\n"
 * Returns { reading } or throws.
 *
 * value1 / value2 (calibration) always come from the hardcoded
 * config — they are NOT transmitted over Bluetooth.
 */
function parseSerialLine(line) {
    const trimmed = line.trim();

    // Expect "DATA:<number>"
    const match = trimmed.match(/^DATA:(\d+)$/i);
    if (!match) {
        throw new Error(`non-data line: ${trimmed}`);
    }

    const reading = parseInt(match[1], 10);
    if (isNaN(reading)) {
        throw new Error(`NaN in parsed reading: ${trimmed}`);
    }

    return { reading };
}

/**
 * Called for every line received over serial.
 */
async function onSerialLine(line) {
    let parsed;
    try {
        parsed = parseSerialLine(line);
    } catch (err) {
        console.log(`[SERIAL] Skipping line — ${err.message}`);
        return;
    }

    const { reading } = parsed;
    console.log(`[SERIAL] reading=${reading}  (calibration from config)`);

    // Only store the reading — value1/value2 always come from hardcoded config, not the serial stream
    latestESPData = { reading, value1: latestESPData.value1, value2: latestESPData.value2, lastUpdated: new Date().toISOString() };

    if (mpcRunning) {
        console.log('[SERIAL] MPC already running, skipping this reading');
        return;
    }

    mpcRunning = true;
    try {
        // Always use config calibration values, never the serial stream values
        await runMPCForReading(reading, CARBYNESTACK_CONFIG.CALIBRATION.value1, CARBYNESTACK_CONFIG.CALIBRATION.value2);
    } catch (err) {
        console.error(`[SERIAL] MPC error: ${err.message}`);
    } finally {
        mpcRunning = false;
    }
}

/**
 * Open the serial port and attach the line parser.
 * Returns a promise that resolves when the port is open, or rejects on error.
 */
function openSerialPort(portPath) {
    return new Promise((resolve, reject) => {
        const sp = new SerialPort({
            path: portPath,
            baudRate: SERIAL_BAUD_RATE,
            autoOpen: false
        });

        // Attach error listener BEFORE open() so we never get an
        // unhandled 'error' event during the open/stabilise window.
        sp.on('error', (err) => {
            console.error(`[SERIAL] Port error: ${err.message}`);
        });

        const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }));

        sp.open((err) => {
            if (err) return reject(err);
            console.log(`[SERIAL] Opened ${portPath} at ${SERIAL_BAUD_RATE} baud`);
            resolve({ sp, parser });
        });
    });
}

// ─────────────────────────────────────────────────
//  Core MPC runner (shared by serial loop & manual endpoint)
// ─────────────────────────────────────────────────
async function runMPCForReading(reading, value1, value2) {
    console.log(`\n[${new Date().toISOString()}] ===== MPC START =====`);
    console.log(`[MPC] reading=${reading}  value1=${value1}  value2=${value2}`);

    const configErrors = validateConfig();
    if (configErrors.length > 0) {
        console.error('[MPC] Config errors:', configErrors);
        throw new Error(`Configuration errors: ${configErrors.join(', ')}`);
    }

    const env = { ...process.env, ...CARBYNESTACK_CONFIG.ENV_VARIABLES };
    if (CARBYNESTACK_CONFIG.JAVA_OPTS) env.JAVA_OPTS = CARBYNESTACK_CONFIG.JAVA_OPTS;

    await initializeCalibrationSecrets(env);

    // Guarantee calibration masked inputs are always populated in latestMaskedInputs.
    // initializeCalibrationSecrets skips creation when hashes already exist (cached),
    // so we force-restore from config here on every MPC cycle.
    if (!latestMaskedInputs.value1Masked && CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret) {
        latestMaskedInputs.value1Masked = CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret;
    }
    if (!latestMaskedInputs.value2Masked && CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret) {
        latestMaskedInputs.value2Masked = CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret;
    }

    // Step 1 — secret for sensor reading
    console.log('[STEP 1] Creating secret for sensor reading...');
    const { hash: readingHash, maskedInput: readingMasked } = await createSecret(reading, env);
    console.log(`[STEP 1] ✅ readingHash: ${readingHash}, maskedInput: ${readingMasked}`);

    // Push reading masked input to UI immediately (before MPC finishes)
    latestMaskedInputs.readingMasked = readingMasked;
    // Update latest ESP data with masked input so /esp-data reflects it instantly
    latestESPData = { ...latestESPData, maskedInput: readingMasked };

    // Step 2 — MPC execution
    console.log('[STEP 2] Executing MPC...');
    const rawResult = await executeMPC(
        readingHash,
        CARBYNESTACK_CONFIG.CALIBRATION.value1Hash,
        CARBYNESTACK_CONFIG.CALIBRATION.value2Hash,
        env
    );
    console.log(`[STEP 2] ✅ rawResult: ${rawResult}`);

    // Step 3 — Extract result UUID from ephemeral execute output, then call
    //           amphora get-secret to read the output_share and decoded plaintext.
    //
    // ephemeral execute output:
    //   ERROR StatusLogger ...
    //   <uuid>                    ← the result secret ID, nothing else needed from here
    //
    // amphora get-secret <uuid> output:
    //   ERROR StatusLogger ...
    //   output_share: 135866916338824540697450574455991115900
    //   [151]
    //       owner -> elon@carbynestack.io
    //       authorizedPrograms -> ephemeral-generic
    //       ...
    console.log('[STEP 3] Extracting result secret UUID from ephemeral output...');
    const rawLines = rawResult.trim().split('\n');
    let resultHash = null;

    // The result UUID is always the LAST UUID in the output.
    // The MPC program body is echoed before it, so we scan all lines
    // and keep overwriting — the final match is the result secret ID.
    for (const line of rawLines) {
        const t = line.trim();
        if (!t) continue;
        if (/StatusLogger|log4j|SimpleLogger|classpath/i.test(t)) continue;
        // Match UUID whether bare or wrapped in brackets: [uuid] or uuid
        const uuidMatch = t.match(/\[?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]?/i);
        if (uuidMatch) { resultHash = uuidMatch[1]; } // no break — keep going to get the last one
    }

    if (!resultHash) {
        throw new Error(`No result secret UUID found in ephemeral execute output:\n${rawResult}`);
    }
    console.log(`[STEP 3] ✅ resultHash: ${resultHash}`);

    // Step 4 — Call amphora get-secret to get the output_share (the masked result)
    //           and the decoded plaintext classification value.
    console.log('[STEP 4] Fetching result secret via amphora get-secret...');
    const fetchCommand = `java -jar ${CARBYNESTACK_CONFIG.CS_JAR_PATH} amphora get-secret ${resultHash}`;
    const getSecretOutput = await executeCommand(fetchCommand, env);
    console.log(`[STEP 4] get-secret raw output:\n${getSecretOutput}`);

    let mpcResultMasked = null;  // output_share  → "Irrigation Recommendation Secret" panel
    let mpcPlaintext    = null;  // bracketed decoded value, e.g. [151]

    for (const line of getSecretOutput.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (/StatusLogger|log4j|SimpleLogger|classpath/i.test(t)) continue;

        // output_share: <bigint>
        const shareMatch = t.match(/output_share:\s*(\d+)/i);
        if (shareMatch) { mpcResultMasked = shareMatch[1]; continue; }

        // Bracketed decoded plaintext, e.g. [151]
        const bracketMatch = t.match(/^\[([^\]]+)\]$/);
        if (bracketMatch && mpcPlaintext === null) { mpcPlaintext = bracketMatch[1].trim(); continue; }
    }

    console.log(`[STEP 4] output_share: ${mpcResultMasked}  |  plaintext: [${mpcPlaintext}]`);

    // Store output_share for the "Irrigation Recommendation Secret" UI panel
    latestMaskedInputs.mpcResultMasked = mpcResultMasked;

    // The MPC program computes is_dry / is_moderate / is_wet and returns them as a
    // 3-element array, e.g. [1, 0, 0].  mpcPlaintext is the content inside the brackets,
    // e.g. "1, 0, 0".  Parse the three integers directly — no boundary comparison needed.
    let finalResult;
    if (mpcPlaintext !== null) {
        const parts = mpcPlaintext.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
            finalResult = parts.join(' ');   // → "1 0 0" / "0 1 0" / "0 0 1"
            console.log(`[STEP 4] Parsed 3-value result: [${parts.join(', ')}]`);
        } else {
            // Unexpected format — fall back to raw output parse
            console.log(`[STEP 4] Unexpected plaintext format "${mpcPlaintext}" — falling back`);
            finalResult = parseMPCOutput(getSecretOutput);
        }
    } else {
        console.log('[STEP 4] No bracketed plaintext — parsing get-secret output directly');
        finalResult = parseMPCOutput(getSecretOutput);
    }

    console.log(`[STEP 4] ✅ finalResult: ${finalResult}`);

    // Update share state — carry all four masked inputs + plaintext for the UI
    const entry = {
        player1Sent:     readingHash,
        player2Sent:     CARBYNESTACK_CONFIG.CALIBRATION.value1Hash,
        player1Received: resultHash,
        player2Received: CARBYNESTACK_CONFIG.CALIBRATION.value2Hash,
        mpcResult:       finalResult,
        mpcPlaintext:    mpcPlaintext,
        timestamp:       new Date().toISOString(),
        // Masked inputs shown in the 4 dashboard panels
        readingMasked:   readingMasked,
        mpcResultMasked: mpcResultMasked,
        value1Masked:    latestMaskedInputs.value1Masked,
        value2Masked:    latestMaskedInputs.value2Masked,
    };

    currentShareState = entry;
    shareStateHistory.push(entry);
    if (shareStateHistory.length > 50) shareStateHistory.shift();

    console.log(`[MPC] ✅ Done. result=${finalResult}  |  resultHash=${resultHash}  |  output_share=${mpcResultMasked}  |  plaintext=[${mpcPlaintext}]`);
    return { result: finalResult, readingHash, resultHash, readingMasked, mpcResultMasked, mpcPlaintext };
}

// ─────────────────────────────────────────────────
//  Start / Stop serial endpoints
// ─────────────────────────────────────────────────

/**
 * POST /start-polling
 * Body (optional): { "port": "/dev/ttyUSB0" }
 *
 * Opens the serial port and starts listening for CSV lines.
 */
let reconnectTimer = null;

/**
 * Try to reopen the rfcomm port after an unexpected close.
 * Retries every 5 s until /stop-polling is called.
 */
async function attemptReconnect(portPath) {
    if (!isPollingActive) return;
    console.log(`[SERIAL] Reconnecting to ${portPath}...`);
    try {
        await connectPort(portPath);
        console.log(`[SERIAL] Reconnected to ${portPath}`);
    } catch (err) {
        console.error(`[SERIAL] Reconnect failed: ${err.message} — retrying in 5 s`);
        if (isPollingActive) {
            reconnectTimer = setTimeout(() => attemptReconnect(portPath), 5000);
        }
    }
}

/**
 * Open the port, wire up all listeners, store in globals.
 * Single place that owns the full lifecycle for one connection.
 */
async function connectPort(portPath) {
    const { sp, parser } = await openSerialPort(portPath);

    serialPort   = sp;
    serialParser = parser;

    parser.on('data', onSerialLine);

    sp.on('close', () => {
        console.warn('[SERIAL] Port closed unexpectedly');
        mpcRunning   = false;
        serialPort   = null;
        serialParser = null;
        if (isPollingActive) {
            console.log('[SERIAL] Scheduling reconnect in 3 s...');
            reconnectTimer = setTimeout(() => attemptReconnect(portPath), 3000);
        }
    });

    console.log(`[SERIAL] Listening on ${portPath}`);
}

app.post('/start-polling', async (req, res) => {
    if (isPollingActive) {
        return res.json({ success: true, message: 'Already reading from serial port' });
    }

    const portPath = req.body?.port || SERIAL_PORT_PATH;

    try {
        isPollingActive = true;          // set before connectPort so close handler works
        await connectPort(portPath);
        res.json({ success: true, message: `Listening on serial port ${portPath}` });
    } catch (err) {
        isPollingActive = false;         // roll back on failure
        console.error(`[SERIAL] Failed to open port: ${err.message}`);
        res.status(500).json({ success: false, error: `Failed to open serial port ${portPath}: ${err.message}` });
    }
});

/**
 * POST /stop-polling
 * Closes the serial port and stops processing.
 */
app.post('/stop-polling', (req, res) => {
    // Cancel any pending reconnect attempt first
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

    isPollingActive = false;
    mpcRunning = false;

    if (!serialPort) {
        return res.json({ success: true, message: 'Not currently reading from serial port' });
    }

    serialPort.close((err) => {
        if (err) console.error(`[SERIAL] Error closing port: ${err.message}`);
        else console.log('[SERIAL] Port closed');
    });

    serialPort = null;
    serialParser = null;

    res.json({ success: true, message: 'Serial port closed' });
});

/**
 * GET /esp-data
 * Returns the latest raw sensor values received over serial.
 */
app.get('/esp-data', (req, res) => {
    res.json({
        polling: isPollingActive,
        ...latestESPData,
        // Masked inputs — available as soon as secrets are created
        readingMasked:   latestMaskedInputs.readingMasked,
        mpcResultMasked: latestMaskedInputs.mpcResultMasked,
        value1Masked:    latestMaskedInputs.value1Masked,
        value2Masked:    latestMaskedInputs.value2Masked,
    });
});

/**
 * GET /serial-ports
 * Lists available serial ports — useful for the UI to let the user pick the right one.
 */
app.get('/serial-ports', async (req, res) => {
    try {
        const ports = await SerialPort.list();
        res.json({ success: true, ports });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────
//  Share-state endpoint
// ─────────────────────────────────────────────────
app.get('/share-state', (req, res) => {
    res.json({
        current: currentShareState,
        history: shareStateHistory
    });
});

// ─────────────────────────────────────────────────
//  Manual /execute-mpc endpoint
//  POST body: { reading, value1?, value2? }
// ─────────────────────────────────────────────────
app.post('/execute-mpc', async (req, res) => {
    const { reading, value1, value2 } = req.body;

    console.log(`\n[${new Date().toISOString()}] ========== MANUAL MPC REQUEST ==========`);
    console.log(`[REQUEST] reading=${reading}  value1=${value1}  value2=${value2}`);

    if (reading === undefined || reading === null) {
        return res.status(400).json({ success: false, error: 'Missing required parameter: reading' });
    }

    try {
        const v1 = value1 ?? CARBYNESTACK_CONFIG.CALIBRATION.value1;
        const v2 = value2 ?? CARBYNESTACK_CONFIG.CALIBRATION.value2;
        const { result, readingHash, resultHash } = await runMPCForReading(reading, v1, v2);

        res.json({
            success: true,
            result,
            resultHash,
            readingHash,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[ERROR]`, error);
        res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
    }
});

// ─────────────────────────────────────────────────
//  Health / config-check
// ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
    const configErrors = validateConfig();
    res.json({
        status: configErrors.length === 0 ? 'healthy' : 'configuration_error',
        configErrors,
        calibrationInitialized: calibrationHashesInitialized,
        serialConnected: isPollingActive,
        serialPort: serialPort?.path || null,
        timestamp: new Date().toISOString()
    });
});

app.get('/config-check', (req, res) => {
    const configErrors = validateConfig();
    res.json({
        configured: configErrors.length === 0,
        errors: configErrors,
        config: {
            jarExists: fs.existsSync(CARBYNESTACK_CONFIG.CS_JAR_PATH || ''),
            mpcExists: fs.existsSync(CARBYNESTACK_CONFIG.MPC_FILE_PATH || ''),
            envVarsCount: Object.keys(CARBYNESTACK_CONFIG.ENV_VARIABLES).length,
            calibrationSet: CARBYNESTACK_CONFIG.CALIBRATION.value1 !== null && CARBYNESTACK_CONFIG.CALIBRATION.value2 !== null,
            calibrationHashesSet: CARBYNESTACK_CONFIG.CALIBRATION.value1Hash !== null && CARBYNESTACK_CONFIG.CALIBRATION.value2Hash !== null
        }
    });
});

// ─────────────────────────────────────────────────
//  Initialize calibration endpoint
// ─────────────────────────────────────────────────
app.post('/initialize-calibration', async (req, res) => {
    try {
        const env = { ...process.env, ...CARBYNESTACK_CONFIG.ENV_VARIABLES };
        if (CARBYNESTACK_CONFIG.JAVA_OPTS) env.JAVA_OPTS = CARBYNESTACK_CONFIG.JAVA_OPTS;

        calibrationHashesInitialized = false;
        CARBYNESTACK_CONFIG.CALIBRATION.value1Hash = null;
        CARBYNESTACK_CONFIG.CALIBRATION.value2Hash = null;

        await initializeCalibrationSecrets(env);

        res.json({
            success: true,
            message: 'Calibration secrets initialized',
            value1Hash: CARBYNESTACK_CONFIG.CALIBRATION.value1Hash,
            value2Hash: CARBYNESTACK_CONFIG.CALIBRATION.value2Hash,
            value1Masked: latestMaskedInputs.value1Masked,
            value2Masked: latestMaskedInputs.value2Masked,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  Arduino Soil Sensor + CarbyneStack Server (BT Serial)     ║
║  Running on http://localhost:${PORT}                       ║
║  Default BT port: ${SERIAL_PORT_PATH.padEnd(38)}║
╚════════════════════════════════════════════════════════════╝
    `);

    const configErrors = validateConfig();
    if (configErrors.length > 0) {
        console.warn('\n⚠️  WARNING: Configuration issues detected:');
        configErrors.forEach(e => console.warn(`   - ${e}`));
        console.warn('\nPlease update carbynestack-config.js before using the application.\n');
    } else {
        console.log('✅ Configuration validated successfully');
        console.log(`✅ Calibration values: Value1=${CARBYNESTACK_CONFIG.CALIBRATION.value1}, Value2=${CARBYNESTACK_CONFIG.CALIBRATION.value2}`);

        if (CARBYNESTACK_CONFIG.CALIBRATION.value1Hash && CARBYNESTACK_CONFIG.CALIBRATION.value2Hash) {
            console.log('✅ Calibration hashes already set:');
            console.log(`   Value1 Hash: ${CARBYNESTACK_CONFIG.CALIBRATION.value1Hash}`);
            console.log(`   Value2 Hash: ${CARBYNESTACK_CONFIG.CALIBRATION.value2Hash}`);
            calibrationHashesInitialized = true;

            // Restore masked inputs into memory so they are served immediately
            // on the first /share-state or /esp-data poll — no MPC cycle needed.
            if (CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret) {
                latestMaskedInputs.value1Masked = CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret;
                console.log(`   Value1 Masked: ${CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret.substring(0, 12)}…`);
            }
            if (CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret) {
                latestMaskedInputs.value2Masked = CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret;
                console.log(`   Value2 Masked: ${CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret.substring(0, 12)}…`);
            }
        } else {
            console.log('ℹ️  Calibration secrets will be created on first /start-polling or /execute-mpc call');
        }
    }

    console.log('\n📡 Bluetooth Serial Mode: pair ESP32 first, then POST /start-polling');
    console.log(`   Default BT port : ${SERIAL_PORT_PATH}`);
    console.log('   Override        : POST /start-polling  { "port": "/dev/rfcomm1" }');
    console.log('   List ports      : GET  /serial-ports\n');
    console.log('   Linux pairing   : sudo rfcomm bind 0 E0:8C:FE:32:D8:9E  →  /dev/rfcomm0\n');
});
