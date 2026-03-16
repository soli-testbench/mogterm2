import { createServer } from "node:http";

const port = process.env.PORT || 8080;

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from mogterm2!\n");
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
