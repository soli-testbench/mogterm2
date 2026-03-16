const http = require("http");
const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("mogterm2 is running\n");
});
server.listen(port, () => console.log("listening on port " + port));
