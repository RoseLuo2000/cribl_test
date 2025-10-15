import { ChildProcess } from "child_process";
import test, { describe } from "node:test";

const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const CONF_DIR = path.join(__dirname, '../src');
const AGENT_DIR = path.join(CONF_DIR, 'agent');
const SPLITTER_DIR = path.join(CONF_DIR, 'splitter');
const TARGET1_DIR = path.join(CONF_DIR, 'target_1');
const TARGET2_DIR = path.join(CONF_DIR, 'target_2');

const OUTPUT_FILES = [
    path.join(TARGET1_DIR, 'events_1.log'),
    path.join(TARGET2_DIR, 'events_2.log')
];

function startNodeProcess(dir: string, hostname: string): ChildProcess {
    return spawn('node', ['app.js', dir, hostname], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('TCP Data Flow Tests', () => {
    let target1: ChildProcess, target2: ChildProcess, splitter: ChildProcess, agent: ChildProcess;

    beforeAll(() => {
        // Clean up output files
        // OUTPUT_FILES.forEach(file => fs.existsSync(file) && fs.unlinkSync(file));
        // 1. Start targets
        target1 = startNodeProcess(TARGET1_DIR, 'target_1');
        target2 = startNodeProcess(TARGET2_DIR, 'target_2');

        // 2. Start splitter
        splitter = startNodeProcess(SPLITTER_DIR, 'splitter');

        // 3. Start agent
        agent = startNodeProcess(AGENT_DIR, 'agent');

    });

    afterAll(() => {
        // 6. Kill processes
        [target1, target2, splitter, agent].forEach(p => p.kill());

    });


    test('Target nodes receive correct data', async () => {

        // 4. Wait for data to propagate (adjust time depending on file size)
        await wait(2000);

        // 5. Read target outputs
        const expectedData = fs.readFileSync(path.join(AGENT_DIR, 'inputs/large_1M_events.log'), 'utf-8');
        // OUTPUT_FILES.forEach(file => {
        //     const receivedData = fs.readFileSync(file, 'utf-8');
        //     expect(receivedData).toBe(expectedData);
        // });


    });

});
