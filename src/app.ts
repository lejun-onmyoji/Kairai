import * as net from 'net';

let server = net.createServer(); 
server.on('connection', newConn); 
server.listen({host: '127.0.0.1', port: 1234});



function newConn(socket: net.Socket): void {
  console.log('new connection', socket.remoteAddress, socket.remotePort); // ...
  }