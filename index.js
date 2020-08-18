const fs = require("fs");
const readLine = require("readline-sync");

const Yeelight = require("node-yeelight");
const WebSocket = require("ws");

const isReconnect = fs.existsSync("reconnectToken");
const isDev = process.env.NODE_ENV === "development";

let connectionToken = isReconnect ? fs.readFileSync("reconnectToken", { encoding: "utf8" }) : readLine.question("Enter connection token: ");
let deviceFinded = false;
let deviceId = isReconnect ? fs.readFileSync("deviceId", { encoding: "utf8" }) : null;

let state = false;

const y = new Yeelight;
 
y.on('ready', () => {
    y.discover();
});

y.on('deviceadded', device => {
    if (!deviceFinded) y.connect(device);
    else deviceFinded = true;
});

y.on('deviceconnected', device => {
    start(device);
});

async function start(device) {
    let ws = new WebSocket(isDev ? "ws://localhost:3091/" : "wss://home.mfsoftware.site/ws");

    function send(data) {
        ws.send(JSON.stringify(data));
    }

    function sendNotification(title, message, type = "normal", senderId = null) {
        let body = {
            type: "notification",
            notificationType: type,
            notification: {
                title: title,
                message: message
            }
        };

        if (type === "security") {
            if (senderId == null) {
                console.error("senderId must be passed");
                return;
            }

            body.senderSessionId = senderId;
        }
        
        send(body);
    }

    function sendStateResponse(userSessionId, requestId, state) {
        send({
            type: "stateResponse",
            userSessionId: userSessionId,
            responseId: requestId,
            state: state
        });
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

                if (state) sendNotification("Внимание", "Свет включен", "security", msg.senderSessionId);
                break;

            case "stateRequest":
                sendStateResponse(msg.userSessionId, msg.requestId, [
                    {
                        key: "temperature",
                        value: "22 °С"
                    }
                ]);
                break;

            default:
                console.log("Unknown message:", msg);
                break;
        }
    });

    ws.on("close", () => {
        console.log();
        console.log("Disconnected");

        // TODO: Write reconnect algo
        /*let timeout = setInterval(() => {
            clearInterval(timeout);

        }, 5000);*/

        process.exit();
    });
}

y.listen();