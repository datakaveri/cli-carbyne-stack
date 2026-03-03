const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http'); // ← NEW: to poll ESP32 over WiFi

// Load configuration
const CARBYNESTACK_CONFIG = require('./carbynestack-config.js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─────────────────────────────────────────────────
//  ESP32 WiFi configuration
//  The ESP32 runs as an Access Point at 192.168.4.1
//  serving a plain HTTP page at GET /
// ─────────────────────────────────────────────────
const ESP32_HOST = '192.168.4.1';
const ESP32_PORT = 80;
const ESP32_POLL_INTERVAL_MS = 500; // poll every 500 ms

// Polling state
let espPollingTimer = null;
let isPollingActive = false;

// Latest values read from ESP32 (shared with /share-state endpoint)
let latestESPData = {
    reading: null,
    value1: null,
    value2: null,
    lastUpdated: null
};

// ─────────────────────────────────────────────────
//  Share-state store (unchanged from original)
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

// Store calibration hashes in memory
let calibrationHashesInitialized = false;

// ─────────────────────────────────────────────────
//  Validate configuration (unchanged)
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
//  Execute shell command (unchanged)
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
//  Create Amphora secret (unchanged)
// ─────────────────────────────────────────────────
async function createSecret(value, env) {
    const accessPolicy = CARBYNESTACK_CONFIG.AMPHORA.ACCESS_POLICY;
    const authorizedPrograms = CARBYNESTACK_CONFIG.AMPHORA.AUTHORIZED_PROGRAMS;
    const command = `java -jar ${CARBYNESTACK_CONFIG.CS_JAR_PATH} amphora create-secret ${value} -t accessPolicy=${accessPolicy} -t authorizedPrograms=${authorizedPrograms}`;

    try {
        const output = await executeCommand(command, env);
        const lines = output.split('\n');
        let maskedInput = null;
        let hash = null;

        for (const line of lines) {
	if (line.includes('masked_input:')) {
		const maskedMatch = line.match(/masked_input:\s*(\d+)/i);
		if (maskedMatch) {
		    maskedInput = maskedMatch[1];
		}
    	}
            if (line.includes('Secret ID:') || line.includes('Hash:') || line.includes('secret')) {
                const match = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32,})/i);
                if (match) { hash = match[1];}
            }
        }

        if (!hash) {
            const nonEmptyLines = lines.filter(l => l.trim().length > 0);
            hash = nonEmptyLines[nonEmptyLines.length - 1];
        }

        console.log(`[SECRET] Created secret for value ${value},Masked: ${maskedInput}, hash: ${hash}`);
        return {hash,maskedInput};
    } catch (error) {
        throw new Error(`Failed to create secret: ${error.message}`);
    }
}

// ─────────────────────────────────────────────────
//  Initialize calibration secrets (unchanged)
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
            const {hash:value1Hash, value1sharesecret} = await createSecret(CARBYNESTACK_CONFIG.CALIBRATION.value1, env);
            CARBYNESTACK_CONFIG.CALIBRATION.value1Hash = value1Hash;
            CARBYNESTACK_CONFIG.CALIBRATION.value1sharesecret = value1sharesecret;
            console.log(`[INIT] Value1 hash: ${value1Hash},Value1sharesecret hash: ${value1Hash}`);
        }

        if (!CARBYNESTACK_CONFIG.CALIBRATION.value2Hash) {
            console.log('[INIT] Creating secret for value2 (water)...');
            const {hash: value2Hash,value2sharesecret} = await createSecret(CARBYNESTACK_CONFIG.CALIBRATION.value2, env);
            CARBYNESTACK_CONFIG.CALIBRATION.value2Hash = value2Hash;
            CARBYNESTACK_CONFIG.CALIBRATION.value2sharesecret = value2sharesecret;
            console.log(`[INIT] Value2 hash: ${value2Hash},Value2sharesecret hash: ${value2Hash}`);
        }

        calibrationHashesInitialized = true;
        await updateConfigFile();
        console.log('[INIT] ✅ Calibration secrets initialized successfully');
    } catch (error) {
        throw new Error(`Failed to initialize calibration secrets: ${error.message}`);
    }
}

// ─────────────────────────────────────────────────
//  Update config file (unchanged)
// ─────────────────────────────────────────────────
async function updateConfigFile() {
    try {
        const configPath = path.join(__dirname, 'carbynestack-config.js');
        let configContent = fs.readFileSync(configPath, 'utf8');
        configContent = configContent.replace(/value1Hash:\s*null/, `value1Hash: '${CARBYNESTACK_CONFIG.CALIBRATION.value1Hash}'`);
        configContent = configContent.replace(/value2Hash:\s*null/, `value2Hash: '${CARBYNESTACK_CONFIG.CALIBRATION.value2Hash}'`);
        fs.writeFileSync(configPath, configContent);
        console.log('[CONFIG] Updated config file with calibration hashes');
    } catch (error) {
        console.error('[CONFIG] Warning: Could not update config file:', error.message);
    }
}

// ─────────────────────────────────────────────────
//  Execute MPC (unchanged)
// ─────────────────────────────────────────────────
async function executeMPC(readingHash, value1Hash, value2Hash, env) {
    const mpcFile = CARBYNESTACK_CONFIG.MPC_FILE_PATH;
    const jarPath = CARBYNESTACK_CONFIG.CS_JAR_PATH;
    const program = CARBYNESTACK_CONFIG.EPHEMERAL.PROGRAM;
    const command = `cat ${mpcFile} | java -jar ${jarPath} ephemeral execute -i ${readingHash} -i ${value1Hash} -i ${value2Hash} ${program} | tail -n +2 | sed 's/[][]//g'`;

    try {
        return await executeCommand(command, env);
    } catch (error) {
        throw new Error(`MPC execution failed: ${error.message}`);
    }
}

// ─────────────────────────────────────────────────
//  Parse MPC output (unchanged)
// ─────────────────────────────────────────────────
function parseMPCOutput(rawOutput) {
    try {
        const lines = rawOutput.trim().split('\n');
        const firstLine = lines[0].trim();
        console.log(`[PARSE] Raw first line: ${firstLine}`);

        const cleanedLine = firstLine.replace(/[\[\]]/g, '').trim();
        const values = cleanedLine.split(/[\s,]+/).filter(v => v.length > 0);

        if (values.length !== 3) throw new Error(`Expected 3 values, got ${values.length}`);

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
//  NEW: ESP32 WiFi polling logic
//  Fetches http://192.168.4.1/ and parses the HTML
//  for currentReading, Value1, Value2
// ═════════════════════════════════════════════════

/**
 * Fetch one page from the ESP32 web server.
 * Returns the raw HTML body as a string, or throws on error.
 */
function fetchESP32() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: ESP32_HOST,
            port: ESP32_PORT,
            path: '/',
            method: 'GET',
            timeout: 3000 // 3 s timeout — ESP32 can be slow
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve(body));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('ESP32 request timed out'));
        });

        req.on('error', err => reject(err));
        req.end();
    });
}

/**
 * Parse the ESP32 HTML page.
 *
 * The ESP32 sends (from espcode.ino handleRoot):
 *   "<p>Current Reading: <b>NNN</b></p>"
 *   "<p>Dry Calib: NNN | Wet Calib: NNN</p>"
 *
 * Returns { reading, value1, value2 } as integers, or throws.
 */
function parseESP32HTML(html) {
    // Current reading — inside <b>...</b>
    const readingMatch = html.match(/Current Reading:\s*<b>(\d+)<\/b>/i);
    if (!readingMatch) throw new Error('Could not parse currentReading from ESP32 response');
    const reading = parseInt(readingMatch[1], 10);

    // Calibration values
    const calibMatch = html.match(/Dry Calib:\s*(\d+)\s*\|\s*Wet Calib:\s*(\d+)/i);
    if (!calibMatch) throw new Error('Could not parse calibration values from ESP32 response');
    const value1 = parseInt(calibMatch[1], 10); // dry-air
    const value2 = parseInt(calibMatch[2], 10); // water

    return { reading, value1, value2 };
}

/**
 * Single poll cycle: fetch → parse → trigger MPC → update share state.
 * Designed to be called on an interval; does nothing if MPC is already running.
 */
let mpcRunning = false; // debounce — same as original isProcessing flag

async function pollESP32Once() {
    try {
        const html = await fetchESP32();
        const { reading, value1, value2 } = parseESP32HTML(html);

        console.log(`[ESP32] reading=${reading}  value1=${value1}  value2=${value2}`);

        // Broadcast latest raw data to any connected clients via /esp-data endpoint
        latestESPData = { reading, value1, value2, lastUpdated: new Date().toISOString() };

        if (mpcRunning) {
            console.log('[ESP32] MPC already running, skipping this cycle');
            return;
        }

        // Trigger MPC (mirrors the logic in the original /execute-mpc handler)
        mpcRunning = true;
        try {
            await runMPCForReading(reading, value1, value2);
        } finally {
            mpcRunning = false;
        }

    } catch (err) {
        // Don't crash the polling loop on transient errors (WiFi hiccups, etc.)
        console.warn(`[ESP32] Poll error: ${err.message}`);
    }
}

/**
 * Core MPC logic extracted into a reusable function.
 * Called both by the polling loop AND by the manual /execute-mpc endpoint.
 */
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

    // Step 1 — secret for sensor reading
    console.log('[STEP 1] Creating secret for sensor reading...');
    const { hash: readingHash, maskedInput } = await createSecret(reading, env);
    console.log(`[STEP 1] ✅ readingHash: ${readingHash}, maskedInput: ${maskedInput}`);

    // Step 2 — MPC execution
    console.log('[STEP 2] Executing MPC...');
    const rawResult = await executeMPC(
        readingHash,
        CARBYNESTACK_CONFIG.CALIBRATION.value1Hash,
        CARBYNESTACK_CONFIG.CALIBRATION.value2Hash,
        env
    );
    console.log(`[STEP 2] ✅ rawResult: ${rawResult}`);

    // Step 3 — fetch & parse result
    console.log('[STEP 3] Fetching decrypted values...');
    const lines = rawResult.trim().split('\n');
    let resultHash = null;
    for (const line of lines) {
        const match = line.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
        if (match) { resultHash = match[0]; break; }
    }

    let finalResult;
    if (!resultHash) {
        console.log('[STEP 3] No UUID found — parsing rawResult directly');
        finalResult = parseMPCOutput(rawResult);
    } else {
        console.log(`[STEP 3] resultHash: ${resultHash}`);
        const fetchCommand = `java -jar ${CARBYNESTACK_CONFIG.CS_JAR_PATH} amphora get-secret ${resultHash}`;
        const rawOutput = await executeCommand(fetchCommand, env);
        console.log(`[STEP 3] Raw decrypted: ${rawOutput}`);
        finalResult = parseMPCOutput(rawOutput);
    }

    console.log(`[STEP 3] ✅ finalResult: ${finalResult}`);

    // Update share state (mirrors original share-state tracking)
    const entry = {
        player1Sent: readingHash,
        player2Sent: CARBYNESTACK_CONFIG.CALIBRATION.value1Hash,
        player1Received: resultHash,
        player2Received: CARBYNESTACK_CONFIG.CALIBRATION.value2Hash,
        mpcResult: finalResult,
        timestamp: new Date().toISOString()
    };

    currentShareState = entry;
    shareStateHistory.push(entry);
    if (shareStateHistory.length > 50) shareStateHistory.shift(); // keep last 50

    console.log(`[MPC] ✅ Done. Result: ${finalResult}`);
    return { result: finalResult, readingHash, resultHash };
}

// ─────────────────────────────────────────────────
//  Start / Stop polling endpoints  (NEW)
// ─────────────────────────────────────────────────

/**
 * POST /start-polling
 * Tells the server to start polling the ESP32 every 500 ms.
 * The browser calls this instead of opening a serial port.
 */
app.post('/start-polling', (req, res) => {
    if (isPollingActive) {
        return res.json({ success: true, message: 'Already polling' });
    }

    console.log(`[POLL] Starting ESP32 polling at ${ESP32_HOST}:${ESP32_PORT}`);
    isPollingActive = true;

    // Kick off the first poll immediately, then repeat
    pollESP32Once();
    espPollingTimer = setInterval(pollESP32Once, ESP32_POLL_INTERVAL_MS);

    res.json({ success: true, message: `Polling ESP32 at http://${ESP32_HOST}/` });
});

/**
 * POST /stop-polling
 * Stops the ESP32 polling loop.
 */
app.post('/stop-polling', (req, res) => {
    if (!isPollingActive) {
        return res.json({ success: true, message: 'Not currently polling' });
    }

    clearInterval(espPollingTimer);
    espPollingTimer = null;
    isPollingActive = false;
    mpcRunning = false;

    console.log('[POLL] Stopped ESP32 polling');
    res.json({ success: true, message: 'Polling stopped' });
});

/**
 * GET /esp-data
 * Returns the latest raw sensor values fetched from the ESP32.
 * The browser can use this to update the "Current Reading" display
 * without waiting for a full MPC cycle.
 */
app.get('/esp-data', (req, res) => {
    res.json({
        polling: isPollingActive,
        ...latestESPData
    });
});

// ─────────────────────────────────────────────────
//  Share-state endpoint  (NEW — was missing in original)
// ─────────────────────────────────────────────────
app.get('/share-state', (req, res) => {
    res.json({
        current: currentShareState,
        history: shareStateHistory
    });
});

// ─────────────────────────────────────────────────
//  Manual /execute-mpc endpoint  (minimally changed)
//  Still works exactly as before — the browser can
//  POST a reading manually if needed.
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
//  Health / config-check  (unchanged)
// ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
    const configErrors = validateConfig();
    res.json({
        status: configErrors.length === 0 ? 'healthy' : 'configuration_error',
        configErrors,
        calibrationInitialized: calibrationHashesInitialized,
        espPolling: isPollingActive,
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
//  Initialize calibration endpoint  (unchanged)
// ─────────────────────────────────────────────────
app.post('/initialize-calibration', async (req, res) => {
    try {
        const env = { ...process.env, ...CARBYNESTACK_CONFIG.ENV_VARIABLES };
        if (CARBYNESTACK_CONFIG.JAVA_OPTS) env.JAVA_OPTS = CARBYNESTACK_CONFIG.JAVA_OPTS;

        // Force re-initialization
        calibrationHashesInitialized = false;
        CARBYNESTACK_CONFIG.CALIBRATION.value1Hash = null;
        CARBYNESTACK_CONFIG.CALIBRATION.value2Hash = null;

        await initializeCalibrationSecrets(env);

        res.json({
            success: true,
            message: 'Calibration secrets initialized',
            value1Hash: CARBYNESTACK_CONFIG.CALIBRATION.value1Hash,
            value2Hash: CARBYNESTACK_CONFIG.CALIBRATION.value2Hash
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
║  Arduino Soil Sensor + CarbyneStack Server (WiFi Mode)     ║
║  Running on http://localhost:${PORT}                       ║
║  ESP32 AP expected at http://${ESP32_HOST}/          ║
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
        } else {
            console.log('ℹ️  Calibration secrets will be created on first /start-polling or /execute-mpc call');
        }
    }

    console.log('\n📡 WiFi Mode: POST /start-polling to begin reading from ESP32');
    console.log(`   Make sure your laptop is connected to the "${  'ESP32_Sensor_Net'  }" WiFi network`);
    console.log('   ESP32 serves readings at http://192.168.4.1/\n');
});
