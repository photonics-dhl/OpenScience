import net from 'node:net';
function pipe(client, target) {
  const upstream = net.connect(target);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.once('close', () => upstream.destroy());
  upstream.once('close', () => client.destroy());
  client.pipe(upstream); upstream.pipe(client);
}
net.createServer(client => pipe(client, '/egress/egress.sock')).listen(7891, '127.0.0.1');
