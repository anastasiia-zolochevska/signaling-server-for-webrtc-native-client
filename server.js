net = require('net');
appInsights = require("applicationinsights");
var client = appInsights.getClient();

var sockets = [];
var clientCounter = 1;
var clientNameToId = {};
var generalRoom = "GENERAL";

var port = process.env.PORT || 8889;

net.createServer(function (socket) {

    socket.on('data', function (data) {
        filterSockets();

        data = "" + data;
        log(data);

        if (data.indexOf("sign_in") != -1) {
            socket.id = clientCounter++;
            socket.room=generalRoom;
            clientNameToId[socket.id] = data.substring(data.indexOf("?") + 1, data.indexOf("HTTP") - 1);
            var data = formatListOfClients(socket, true);     
            socket.write(formatMessage("200 Added", data, socket.id, true));
            notifyOtherSockets(socket)
        }
        else if (data.indexOf("wait") != -1) {
            socket.room=generalRoom;
            socket.id = data.substring(data.indexOf("peer_id=") + 8, data.indexOf("HTTP") - 1);
        }

        else if (data.indexOf("message") != -1) {
            var fromId = data.substring(data.indexOf("peer_id=") + 8, data.indexOf("&to"));
            var toId = data.substring(data.indexOf("&to") + 4, data.indexOf("HTTP") - 1);
            var toSocket = getSocketById(toId);
            var payload = data.substring(data.indexOf("text/plain\r\n\r\n") + 14, data.length);
            socket.id = fromId;
            socket.room=fromId+"_"+toId;           
            toSocket.room=socket.room;
            forwardMessageToPeer(socket, toSocket, payload);
        }

        sockets.push(socket);
        log("Total open sockets "+sockets.length);

    });

    socket.on('error', function (e) {
        log(e);
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
            if (socket.id === currentSocket.id || socket.room!=currentSocket.room) return;
            var data = clientNameToId[currentSocket.id] + "," + currentSocket.id + ",1\n";
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
        log("format", currentSocket.id, currentSocket.room);
        var result = clientNameToId[currentSocket.id] + "," + currentSocket.id + ",1\n";
        sockets.forEach(function (socket) {
            if (socket.id != currentSocket.id && clientNameToId[socket.id] && socket.room==currentSocket.room) {
                result += clientNameToId[socket.id] + "," + socket.id + ",1\n"
            }
        });

        return result;
    }

    function formatMessage(status, data, pragma, shouldCLoseConnection) {
        var message = "HTTP/1.1 " + status + " \r\n" +
            "Server: PeerConnectionTestServer/0.1\r\n" +
            "Cache-Control: no-cache\r\n" +
            (shouldCLoseConnection ? "Connection: close\r\n" : "") +
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

    function log(message){
       client.trackTrace(message); 
    }


}).listen(port);

client.trackTrace("Signaling server running at port "+ port);
console.log("Signaling server running at port "+ port);