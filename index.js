const fs = require("fs");
const axios = require("axios").default;
const readLine = require("readline-sync");

const Yeelight = require('node-yeelight');
const WebSocket = require("ws");

const isReconnect = fs.existsSync("reconnectToken");
const isDev = process.env.NODE_ENV === "development";

let connectionToken = isReconnect ? fs.readFileSync("reconnectToken", { encoding: "utf8" }) : readLine.question("Enter connection token: ");
let deviceId;
let state = false;

const api = axios.create({
    baseURL: isDev ? "http://localhost:3090/api/" : "https://home.mfsoftware.site/api/"
});
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
    if (fs.existsSync("deviceId")) deviceId = fs.readFileSync("deviceId", { encoding: "utf8" });
    else {
        let r = await api.get("generators/uuid");
        deviceId = r.data.uuid;
        
        fs.writeFileSync("deviceId", deviceId);
    }

    const ws = new WebSocket(isDev ? "ws://localhost:3091/" : "wss://home.mfsoftware.site/ws");

    function send(data) {
        ws.send(JSON.stringify(data));
    }

    ws.on('open', () => {
        if (isReconnect) {
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