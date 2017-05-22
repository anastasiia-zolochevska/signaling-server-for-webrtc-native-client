net = require('net');
appInsights = require("applicationinsights");
var client = appInsights.getClient();

var clientCounter = 1;
var generalRoom = "GENERAL";
var peers = {};

var port = process.env.PORT || 8889;

net.createServer(function (socket) {

    socket.on('end', function() {
        // Remove if wait socket
        if(socket.waitPeer) {
            socket.waitPeer.waitSocket = null;
        }
    });

    socket.tmpData = "";

    socket.on('data', function (newData) {
        socket.tmpData  = socket.tmpData + newData;
        var data = socket.tmpData;
        log(data);

        if (data.indexOf("sign_in") != -1) {
            var newPeer = {}
            newPeer.id = clientCounter++;
            newPeer.peerType = 'client';
            newPeer.messages = [];
            newPeer.name = data.substring(data.indexOf("?") + 1, data.indexOf("HTTP") - 1)
            if (data.indexOf("renderingclient_") != -1) {
                newPeer.peerType = 'client';
            }
            if (data.indexOf("renderingserver_") != -1) {
                newPeer.peerType = 'server';
            }
            peers[newPeer.id] = newPeer;
            socket.write(formatMessage("200 Added", formatListOfPeers(newPeer), newPeer.id));
            notifyOtherPeers(newPeer);
            socket.tmpData = "";
        }
        else if (data.indexOf("wait") != -1) {
            var peerId = data.substring(data.indexOf("peer_id=") + 8, data.indexOf("HTTP") - 1);
            socket.waitPeer = peers[peerId];
            peers[peerId].waitSocket = socket;
            sendMessageToPeer(peers[peerId], null, null);
        }
        else if (data.indexOf("message") != -1) {
            var fromId = data.substring(data.indexOf("peer_id=") + 8, data.indexOf("&to"));
            var toId = data.substring(data.indexOf("&to") + 4, data.indexOf("HTTP") - 1);
            var payload = data.substring(data.indexOf("\r\n\r\n") + 4, data.length);
            var contentLength = /[cC]ontent-[lL]ength: (\d+)/.exec(data)[1]
            contentLength = parseInt(contentLength);
            if(contentLength <= payload.length) {
                peers[toId].roomPeer = peers[fromId]
                peers[fromId].roomPeer = peers[toId];
                sendMessageToPeer(peers[toId], payload, fromId);
                socket.write(formatMessage("200 OK", "", fromId));
                socket.tmpData = "";
            }
        }
        else if (data.indexOf("sign_out") != -1) {
            var peerId = data.substring(data.indexOf("peer_id=") + 8, data.indexOf("HTTP") - 1);
            var peer = peers[peerId]
            delete peers[peerId]

            if(peer.roomPeer) {
                peer.roomPeer.roomPeer = null;
                peer.roomPeer = null;
            }
            socket.write(formatMessage("200 OK", "", peerId));
            socket.tmpData = "";
        }
    });

    socket.on('error', function (e) {
        log("Error", e);
    });

    function sendMessageToPeer(peer, payload, fromId) {
        var msg  = {};
        if(payload) {
            msg.id = fromId || peer.id;
            msg.payload = payload;
            peer.messages.push(msg);
        }
        if(peer.waitSocket) {
            msg = peer.messages.shift();
            if(msg) {
                peer.waitSocket.write(formatMessage("200 OK", msg.payload, msg.id));
                peer.waitSocket.waitPeer = null;
                peer.waitSocket.tmpData = "";
                peer.waitSocket = null;
            }
        }
    }

    function isPeerCandidate(peer, otherPeer) {
        return (otherPeer.id != peer.id && // filter self
                !otherPeer.roomPeer && // filter peers in 'rooms'
                otherPeer.peerType != peer.peerType) // filter out peers of same type
    }

    function notifyOtherPeers(newPeer) {
        for(peerId in peers) {
            var otherPeer = peers[peerId];
            if (isPeerCandidate(newPeer, otherPeer)) {
                var data = newPeer.name + "," + newPeer.id + ",1\n";
                sendMessageToPeer(otherPeer, data);
            }
        }
    }

    function formatListOfPeers(peer) {
        var result = peer.name + "," + peer.id + ",1\n";
        for(peerId in peers) {
            var otherPeer = peers[peerId];
            if (isPeerCandidate(peer, otherPeer)) {
                result += otherPeer.name + "," + otherPeer.id + ",1\n"
            }
        }
        console.log(result);
        return result;
    }

    function formatMessage(status, data, pragma) {
        var message = "HTTP/1.1 " + status + " \r\n" +
            "Server: PeerConnectionTestServer/0.1\r\n" +
            "Cache-Control: no-cache\r\n" +
            "Connection: close\r\n" +
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