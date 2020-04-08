# Shot Core

## Running in development environment

Given a Z Cam listening on `http://192.168.0.100`:

```
npm install
sqlite3 dev.sqlite3 < db/schema.sql
DEBUG=shotcore:* ZCAM_URL=http://192.168.0.100 npm start
```

Starts a web UI listening at [http://localhost:3000](http://localhost:3000)

Environment vars:  
- `ZCAM_URL`: full url to Z Cam, default is `http://localhost:8080`  
- `ZCAM_WS_URL`: override Z Cam WebSockets URL (default is based on `ZCAM_URL`, port + 1)  
- `ZCAM_RTSP_URL`: override Z Cam RTSP URL, default is based on `ZCAM_URL` hostname, port 80  
- `PORT`: web UI server port, default is 3000  
- `DEBUG`: configure debug logging

If you don’t have access to a Z Cam, you can run the [Z Cam Mock Server](./lib/zcam/mock-server/README.md) 

For more, read [DEVELOPERS.md](DEVELOPERS.md).
