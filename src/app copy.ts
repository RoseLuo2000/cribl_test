import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import { Buffer } from "buffer";

interface TCPConfig {
    host: string;
    port: number;
}

interface AgentOutputs {
    tcp: TCPConfig;
}

interface SplitterOutputs {
    tcp: TCPConfig[];
}

interface TargetOutputs {
    file: string;
}

interface AgentInputs {
    monitor: string;
    tcp?: number;
}

interface NodeJSON {
    mode: string;
}

function agent(agent_dir: string, hostname: string) {
    console.log("Working as agent");

    let monitored_filename: string;
    let hostport: TCPConfig;

    fs.promises.readFile(agent_dir + "/outputs.json", "utf-8")
        .then((data) => {
            const json: AgentOutputs = JSON.parse(data);
            hostport = json.tcp;
            console.log("tcp=", hostport, " on ", hostname);

            return fs.promises.readFile(agent_dir + "/inputs.json", "utf-8");
        })
        .then((data) => {
            const json: AgentInputs = JSON.parse(data);
            monitored_filename = agent_dir + "/" + json.monitor;
            console.log("monitored_filename=", monitored_filename);

            console.log("Connecting to ", hostport);
            const clientSocket = net.createConnection(
                { host: hostport.host, port: hostport.port },
                () => {
                    console.log("connected to target", hostport);
                    const rs = fs.createReadStream(monitored_filename);
                    rs.pipe(clientSocket);
                }
            );
        })
        .catch((error) => {
            console.error(error);
        });
}

function writeToSocket(data: Buffer, remoteSocket: net.Socket, localSocket: net.Socket) {
    const flushed = remoteSocket.write(data);
    if (!flushed) {
        localSocket.pause();
    }
}

function splitter(conf_directory: string, hostname: string) {
    console.log("working as splitter");

    const outputsData = fs.readFileSync(conf_directory + "/outputs.json", "utf-8");
    const outputsJson: SplitterOutputs = JSON.parse(outputsData);
    const targets = outputsJson.tcp;

    const inputsData = fs.readFileSync(conf_directory + "/inputs.json", "utf-8");
    const inputsJson: AgentInputs = JSON.parse(inputsData);
    const port = inputsJson.tcp!;
    let sockIdx = 0;

    const server = net.createServer((localSocket) => {
        console.log("client connected");

        const outSocks: net.Socket[] = [];
        targets.forEach((target) => {
            console.log("processing", target);
            const sock = net.createConnection(target, () => {
                console.log("Connected to", target);
            });
            sock.on("end", () => console.error("Disconnected", target));
            sock.on("drain", () => localSocket.resume());
            outSocks.push(sock);
        });

        localSocket.on("data", (data: Buffer) => {
            let idx = data.indexOf("\n");
            let part1: Buffer;
            let part2: Buffer;

            if (idx === -1) {
                part1 = data;
                writeToSocket(part1, outSocks[sockIdx], localSocket);
            } else {
                part1 = data.slice(0, idx + 1);
                part2 = data.slice(idx + 1);
                writeToSocket(part1, outSocks[sockIdx], localSocket);
                sockIdx++;
                sockIdx %= outSocks.length;
                writeToSocket(part2, outSocks[sockIdx], localSocket);
            }
        });
    });

    server.listen(port, hostname, () => console.log("App listening on port", port));
}

function target(conf_directory: string, hostname: string) {
    console.log("working as target");

    const outputsData = fs.readFileSync(conf_directory + "/outputs.json", "utf-8");
    const outputsJson: TargetOutputs = JSON.parse(outputsData);
    const outputFile = outputsJson.file;

    const inputsData = fs.readFileSync(conf_directory + "/inputs.json", "utf-8");
    const inputsJson: AgentInputs = JSON.parse(inputsData);
    const port = inputsJson.tcp!;

    const server = net.createServer((localSocket) => {
        console.log("client connected");
        localSocket.on("data", (data: Buffer) => {
            fs.appendFile(outputFile, data, () => { });
        });
    });

    server.listen(port, hostname, () => console.log("App listening on port", port));
}

// For debugging
console.log("My hostname is:", os.hostname());

if (process.argv.length < 3) {
    console.error(`Usage: ${process.argv0} ${process.argv[1]} <config_dir> <hostname>`);
    process.exit(1);
}

const conf_directory = process.argv[2];
const hostname = process.argv[3];
if (!fs.existsSync(conf_directory)) {
    console.error(`Make sure directory '${conf_directory}' exists`);
    process.exit(1);
}

try {
    const data = fs.readFileSync(conf_directory + "/app.json", "utf-8");
    const json: NodeJSON = JSON.parse(data);
    switch (json.mode) {
        case "agent":
            agent(conf_directory, hostname);
            break;
        case "splitter":
            splitter(conf_directory, hostname);
            break;
        case "target":
            target(conf_directory, hostname);
            break;
        default:
            console.log(`Usage: ${process.argv0} ${process.argv[1]} agent|splitter|target`);
            console.warn("Cannot understand app argument", process.argv);
            process.exit(1);
    }
} catch (err) {
    console.error("Encountered error", err);
    process.exit(1);
}