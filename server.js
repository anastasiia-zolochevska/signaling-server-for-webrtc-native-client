net = require('net');
appInsights = require("applicationinsights");
var client = appInsights.getClient();

var sockets = [];
var clientCounter = 1;
var socketToId = {};
var generalRoom = "GENERAL";

var port = process.env.PORT || 8889;

net.createServer(function (socket) {

    socket.on('data', function (data) {
        filterSockets();

        data = "" + data;
        log(data);

        if (data.indexOf("sign_in") != -1) {
            socket.id = clientCounter++;
            socket.room = generalRoom;
            socketToId[socket.id] = { name: data.substring(data.indexOf("?") + 1, data.indexOf("HTTP") - 1) };
            if (data.indexOf("renderingclient_") != -1) {
                socketToId[socket.id].isRenderingClient = true;
                socket.isRenderingClient = true;
            }
            if (data.indexOf("renderingserver_") != -1) {
                socketToId[socket.id].isRenderingServer = true;
                socket.isRenderingServer = true;
            }
            socket.write(formatMessage("200 Added", formatListOfClients(socket, true), socket.id, true));
            notifyOtherSockets(socket);
        }
        else if (data.indexOf("wait") != -1) {
            socket.room = generalRoom;
            socket.id = data.substring(data.indexOf("peer_id=") + 8, data.indexOf("HTTP") - 1);
        }

        else if (data.indexOf("message") != -1) {
            var fromId = data.substring(data.indexOf("peer_id=") + 8, data.indexOf("&to"));
            var toId = data.substring(data.indexOf("&to") + 4, data.indexOf("HTTP") - 1);
            var toSocket = getSocketById(toId);
            var payload = data.substring(data.indexOf("text/plain\r\n\r\n") + 14, data.length);
            socket.id = fromId;
            socket.room = fromId + "_" + toId;
            toSocket.room = socket.room;
            forwardMessageToPeer(socket, toSocket, payload);
        }

        sockets.push(socket);
        log("Total open sockets " + sockets.length);

    });

    socket.on('error', function (e) {
        log("Error", e);
    });

    function filterSockets() {
        sockets = sockets.filter(function (value) {
            return !value.destroyed;
        })
    }

    function forwardMessageToPeer(currentSocket, toSocket, data) {
        toSocket.write(formatMessage("200 OK", data, currentSocket.id, false));
        currentSocket.write(formatMessage("200 OK", "", currentSocket.id, true));
    }

    function notifyOtherSockets(currentSocket) {
        sockets.forEach(function (socket) {
            if (socket.id === currentSocket.id ||
                socket.room != currentSocket.room ||
                (currentSocket.isRenderingClient && socketToId[socket.id].isRenderingClient) ||
                (currentSocket.isRenderingServer && socketToId[socket.id].isRenderingServer))
                return;
            var data = socketToId[currentSocket.id].name + "," + currentSocket.id + ",1\n";
            var message = formatMessage("200 OK", data, socket.id, true);
            socket.write(message);
        });
    }

    function getSocketById(id) {
        return sockets.find(socket => {
            if (socket.id === id) return socket;
        });
    }

    function formatListOfClients(currentSocket) {

        var result = socketToId[currentSocket.id].name + "," + currentSocket.id + ",1\n";
        sockets.forEach(function (socket) {
            if (socket.id != currentSocket.id &&
                socketToId[socket.id] &&
                socket.room == currentSocket.room &&
                !(currentSocket.isRenderingClient && socketToId[socket.id].isRenderingClient) &&
                !(currentSocket.isRenderingServer && socketToId[socket.id].isRenderingServer)) {
                result += socketToId[socket.id].name + "," + socket.id + ",1\n"
            }
        });
        console.log(result);

        return result;
    }

    function formatMessage(status, data, pragma, shouldCloseConnection) {
        var message = "HTTP/1.1 " + status + " \r\n" +
            "Server: PeerConnectionTestServer/0.1\r\n" +
            "Cache-Control: no-cache\r\n" +
            (shouldCloseConnection ? "Connection: close\r\n" : "") +
            "Content-Type: text/plain\r\n" +
            "Content-Length: " + data.length + "\r\n" +
            "Pragma: " + pragma + "\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Credentials: true\r\n" +
            "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n" +
            "Access-Control-Allow-Headers: Content-Type, " +
            "Content-Length, Connection, Cache-Control\r\n" +
            "Access-Control-Expose-Headers: Content-Length, X-Peer-Id\r\n" +
            "\r\n" +
            data;

        return message;
    }

    function log(message) {
        console.log(message);
        client.trackTrace(message);
    }


}).listen(port);

client.trackTrace("Signaling server running at port " + port);
console.log("Signaling server running at port " + port);