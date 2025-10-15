const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('typescript');

jest.setTimeout(300000);

// Locate the nearest parent directory (starting from cwd) that contains package.json
function findProjectRoot(currentDir = process.cwd()) {
    let dir = currentDir;
    while (!fs.existsSync(path.join(dir, 'package.json'))) {
        const parent = path.dirname(dir);
        if (parent === dir) return ''; // reached filesystem root
        dir = parent;
    }
    return dir;
}

const ROOT = findProjectRoot();
const OUTPUT_FILES = [path.join(ROOT, './events.log'), path.join(ROOT, './events_2.log')];

const TARGET1_DIR = path.join(ROOT, 'src/target');
const TARGET2_DIR = path.join(ROOT, 'src/target_2');
const SPLITTER_DIR = path.join(ROOT, 'src/splitter');

const LOG_DIR = path.join(ROOT, `test_artifacts.${(new Date()).toISOString()}`);

// Launch a Node.js child process running src/app.js with the given configuration
// `hostname` specifies the host where the Node.js process runs
// `config` is the directory containing the configuration files
function startNodeProcess(config, hostname) {
    const logFile = path.join(LOG_DIR, `${hostname}.log`);
    const out = fs.createWriteStream(logFile, { flags: 'a' });

    // Absolute path to main app.js
    const appPath = path.join(ROOT, 'src/app.js');

    // Pass the config as argument
    const proc = spawn('node', [appPath, config]);

    // Pipe stdout & stderr to file and console
    proc.stdout.on('data', data => {
        process.stdout.write(`[${hostname}] ${data}`);
        out.write(`[STDOUT] ${data}`);
    });
    proc.stderr.on('data', data => {
        process.stderr.write(`[${hostname}] ${data}`);
        out.write(`[STDERR] ${data}`);
    });

    proc.on('error', err => {
        out.write(`[ERROR] ${err.message}\n`);
    });

    proc.on('exit', (code, signal) => {
        out.write(`[EXIT] code=${code}, signal=${signal}\n`);
        out.end();
    });

    console.log(`### Started ${hostname} (PID: ${proc.pid})`);
    return proc;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Wait until the file is created and its size stops increasing
async function waitForFileStable(filePath, timeout = 120000, stableMs = 2000) {
    console.log(`checking if ${filePath} is created`);

    const start = Date.now();
    let lastSize = 0;

    // wait for file to be created
    while (!fs.existsSync(filePath)) {
        if (Date.now() - start > timeout) {
            throw new Error(`File not created after ${timeout}ms: ${filePath}`);
        }
        await wait(stableMs);
    }

    // wait for file size not increase
    while (true) {
        const stats = fs.statSync(filePath);
        const size = stats.size;

        if (size === lastSize && size > 0) {
            break;
        }
        if (size > lastSize) {
            lastSize = size;
        }

        if (Date.now() - start > timeout) {
            throw new Error(`File not stable after ${timeout}ms: ${filePath}`);
        }
        await wait(stableMs);
    }
}

// Compare two strings line by line and find the common prefix lines
function commonPrefixLines(str1, str2) {
    const lines1 = str1.split(/\r?\n/);
    const lines2 = str2.split(/\r?\n/);

    const commonLines = [];

    const minLen = Math.min(lines1.length, lines2.length);
    const maxLen = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < minLen; i++) {
        if (lines1[i] === lines2[i]) {
            commonLines.push(lines1[i]);
        } else {
            break;
        }
    }

    if (commonLines.length == 0) return '';

    const prefix = commonLines.join('\n');
    if (commonLines.length < maxLen) {
        return prefix + '\n';
    } else {
        return prefix;
    }
}

// checks whether the combined content of two strings(data1 and data2) 
// matches a target string(expectedData) in a rotating or interleaved fashion.
function expectToEqual(data1, data2, expectedData) {
    expect((data1?.length + data2?.length) === expectedData.length);

    let d1 = data1, d2 = data2, expected = expectedData;

    while (expected.length > 0) {
        console.log(`${expected.length} more charactors to check...`);
        const commonLen1 = commonPrefixLines(d1, expected).length;
        if (commonLen1 > 0) {
            d1 = d1.slice(commonLen1);
            expected = expected.slice(commonLen1);
        }
        if (expected.length === 0) return true;
        const commonLen2 = commonPrefixLines(d2, expected).length;
        if (commonLen2 > 0) {
            d2 = d2.slice(commonLen2);
            expected = expected.slice(commonLen2);
        }
        if (expected.length === 0) return true;
        if ((commonLen1 + commonLen2) === 0) break;
    }

    throw new Error(`Failed to match\n<${expected.slice(0, 30)} ... ${expected.slice(-30)}>\nwith\n<${d1.slice(0, 30)} ... ${d1.slice(-30)}>\nand\n<${d2.slice(0, 30)} ... ${d2.slice(-30)}>`);
}

describe('TCP Data Flow Test', () => {
    let target1, target2, splitter, agent;

    beforeAll(async () => {
        // Clean up old output files
        for (const OUTPUT_FILE of OUTPUT_FILES) {
            if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
        }

        // Clean up and create artifacts
        fs.rmSync(LOG_DIR, { recursive: true, force: true });
        fs.mkdirSync(LOG_DIR, { recursive: true });

        // Start all targets and splitter
        target1 = startNodeProcess(TARGET1_DIR, 'target_1');
        target2 = startNodeProcess(TARGET2_DIR, 'target_2');
        splitter = startNodeProcess(SPLITTER_DIR, 'splitter');


    });

    afterAll(() => {
        // Kill all targets and splitter
        [target1, target2, splitter].forEach(p => p.kill());
    });

    beforeEach(() => {
        // Clean up old files, empty them
        for (const OUTPUT_FILE of OUTPUT_FILES) {
            if (fs.existsSync(OUTPUT_FILE)) fs.truncateSync(OUTPUT_FILE);
        }

    });

    afterEach(() => {
        // Kill agent if needed
        agent.kill();
    });

    test('Case #1: Target nodes receive correct data with 1M', async () => {
        const AGENT_DIR = path.join(ROOT, 'src/agent');
        agent = startNodeProcess(AGENT_DIR, 'agent');

        for (const OUTPUT_FILE of OUTPUT_FILES) {
            await waitForFileStable(OUTPUT_FILE);
        }

        const inputFile = path.resolve(AGENT_DIR, 'inputs/large_1M_events.log');
        const expectedData = fs.readFileSync(inputFile, 'utf-8');

        expectToEqual(fs.readFileSync(OUTPUT_FILES[0], 'utf-8'),
            fs.readFileSync(OUTPUT_FILES[1], 'utf-8'),
            expectedData);

    });

    test('Case #2: Target nodes receive correct data with empty lines', async () => {
        const AGENT_DIR = path.join(ROOT, 'src/agentEmptyLines');
        agent = startNodeProcess(AGENT_DIR, 'agent');

        for (const OUTPUT_FILE of OUTPUT_FILES) {
            await waitForFileStable(OUTPUT_FILE);
        }

        const inputFile = path.resolve(AGENT_DIR, 'inputs/small_1K_events_with_empty_lines.log');
        // const inputFile = path.resolve(AGENT_DIR, 'inputs/small_1K_events.log');
        const expectedData = fs.readFileSync(inputFile, 'utf-8');

        expectToEqual(fs.readFileSync(OUTPUT_FILES[0], 'utf-8'),
            fs.readFileSync(OUTPUT_FILES[1], 'utf-8'),
            expectedData);

    });
    test('Case #3: Target nodes receive correct data not ended with new line', async () => {
        const AGENT_DIR = path.join(ROOT, 'src/agentNotEndedWithNewLine');
        agent = startNodeProcess(AGENT_DIR, 'agent');

        for (const OUTPUT_FILE of OUTPUT_FILES) {
            await waitForFileStable(OUTPUT_FILE);
        }

        const inputFile = path.resolve(AGENT_DIR, 'inputs/small_1K_events_not_ended_with_new_line.log');
        // const inputFile = path.resolve(AGENT_DIR, 'inputs/small_1K_events.log');
        const expectedData = fs.readFileSync(inputFile, 'utf-8');

        expectToEqual(fs.readFileSync(OUTPUT_FILES[0], 'utf-8'),
            fs.readFileSync(OUTPUT_FILES[1], 'utf-8'),
            expectedData);

    });
});

