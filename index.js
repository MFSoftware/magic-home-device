const fs = require("fs");
const readLine = require("readline-sync");

const Yeelight = require("node-yeelight");
const WebSocket = require("ws");

const isReconnect = fs.existsSync("reconnectToken");
const isDev = process.env.NODE_ENV === "development";

let connectionToken = isReconnect ? fs.readFileSync("reconnectToken", { encoding: "utf8" }) : readLine.question("Enter connection token: ");
let deviceId = isReconnect ? fs.readFileSync("deviceId", { encoding: "utf8" }) : null;
let state = false;

const y = new Yeelight;
 
y.on('ready', () => {
    y.discover(); // scan network for active Yeelights
});

y.on('deviceadded', device => {
    y.connect(device);
});

y.on('deviceconnected', device => {
    start(device);
});

async function start(device) {
    const ws = new WebSocket(isDev ? "ws://localhost:3091/" : "wss://home.mfsoftware.site/ws");

    function send(data) {
        ws.send(JSON.stringify(data));
    }

    ws.on('open', () => {
        if (isReconnect) {
            console.log("Device ID:", deviceId);

            send({
                type: "handshake",
                sender: "device",
                token: connectionToken,
                handshakeType: "reconnect"
            });
        } else {
            send({
                type: "handshake",
                sender: "device",
                token: connectionToken,
                handshakeType: "first"
            });
        }
    });
        
    ws.on('message', data => {
        let msg = JSON.parse(data);

        switch (msg.type) {
            case "error":
                console.log("Error:", msg.message);
                break;

            case "response":
                if (msg.responseBody.reconnectToken != null) {
                    fs.writeFileSync("deviceId", msg.responseBody.deviceId);
                    fs.writeFileSync("reconnectToken", msg.responseBody.reconnectToken);
                } else console.log("Response:", msg.responseBody);
                break;

            case "event":
                state = !state;
                y.setPower(device, state, 300);
                break;

            default:
                console.log("Unknown message:", msg);
                break;
        }
    });
}

y.listen();