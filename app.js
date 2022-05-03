const http = require('node:http')

const port = 8080

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end();
})


server.listen(port, () => {
    console.log(`Server listening at port ${port}`);
});