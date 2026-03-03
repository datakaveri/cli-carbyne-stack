// CarbyneSack Configuration Template
// Copy this file to 'carbynestack-config.js' and fill in your actual values

const CARBYNESTACK_CONFIG = {
    // REQUIRED: Path to the CarbyneSack cs.jar file
    // Example: '/home/user/carbynestack/cli/cs.jar'
    CS_JAR_PATH: '/home/samrat/workspace/carbynestack/deployments/cs.jar',
    
    // REQUIRED: Path to the .mpc file (soil.mpc)
    // Example: '/home/user/mpc-programs/soil.mpc'
    MPC_FILE_PATH: '/home/samrat/soilsensor/soil.mpc',
    
    // REQUIRED: CarbyneSack CLI environment variables
    // These will be exported before executing the CLI
    ENV_VARIABLES: {
        prime: 198766463529478683931867765928436695041,
    	r: 141515903391459779531506841503331516415,
    	rinv : 133854242216446749056083838363708373830,
    
    	// Since your JSON has "noSslValidation": true,
    	CS_NO_SSL_VALIDATION: 'true',
        APOLLO_OAUTH2_CLIENT_ID: 'ef3bf022-7579-41bc-af7c-586e3e81d36f',
        STARBUCK_OAUTH2_CLIENT_ID: 'fa8c0057-5411-406b-92a1-5aa32740d9a6',
        APOLLO_FQDN: '172.18.1.128.sslip.io',
        STARBUCK_FQDN: '172.18.2.128.sslip.io',
        PROTOCOL: 'https',
        // Common defaults for local deployments
        CS_NETWORK_ID: 'carbynestack',
        CS_PLAYER_ID: '0',
        CS_PROTOCOL: 'SPDZ'
    },
    
    // OPTIONAL: Java Virtual Machine options
    // Adjust memory settings based on your MPC computation requirements
    JAVA_OPTS: '-Xmx2G -Xms512M',
    
    // OPTIONAL: Timeout for MPC execution in milliseconds
    // Default: 60000 (1 minute)
    // Increase if your MPC computations take longer
    TIMEOUT: 60000,
    
    // REQUIRED: Amphora secret creation settings
    AMPHORA: {
        ACCESS_POLICY: 'carbynestack.def',
        AUTHORIZED_PROGRAMS: 'ephemeral-generic'
    },
    
    // REQUIRED: Ephemeral execution settings
    EPHEMERAL: {
        PROGRAM: 'ephemeral-generic.default'
    },
    
    // REQUIRED: Calibration constants (set these values!)
    // These are uploaded as secrets ONCE and reused for all readings
    CALIBRATION: {
        value1: 2560,     // Dry air calibration value (UPDATE THIS!)
        value2: 1100,     // Water calibration value (UPDATE THIS!)
        
        // Leave these as null - they will be auto-filled after first run
        value1Hash: null,
        value2Hash: null
    }
};

// Export for use in the backend server
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CARBYNESTACK_CONFIG;
}
