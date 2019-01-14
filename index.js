let hid = require('node-hid');
let vgen = new (require('vgen-xbox'))();
let Joycon = require('./joycon');
let ControllerManager = require('./ControllerManager');
let cm = new ControllerManager(vgen);

let express = require('express')
    , http = require('http');

let app = express();
let server = http.createServer(app);

let io = require('socket.io').listen(server);

let joycons = [];


server.listen(8080, () => {
    console.log('Joy-Face App listening on port 8080!');
});

module.exports.socketIOConnections = [];
io.on('connection', ioSocket => {
    module.exports.socketIOConnections.push(ioSocket);
    ioSocket.on('disconnect', () => {
        module.exports.socketIOConnections.splice(module.exports.socketIOConnections.indexOf(ioSocket), 1);
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/node_modules/@iconfu/svg-inject/src'));

let watchLoop = setInterval(()=>{
    let dev = hid.devices().filter((a)=>a.vendorId === 1406 && cm.joycons.find((b)=>b.serialNumber === a.serialNumber) == null);
    let newJoycons = dev.map((a)=>{return new Joycon(a.path,a.serialNumber)});
    newJoycons.forEach((joy)=>cm.addNewJoycon(joy));
    joycons.push(newJoycons);
},1000);
/*let joycons = []
let _controllerPool = []
let controllerPool = new Proxy(_controllerPool,{
  get:(target,property)=>{
    return target.filter((con)=>joycons.find((a)=>a.controller === con) == null)[property]
  }
})
let finalized = false
let joyconWatchLoop = setInterval(()=>{
  joycons = joycons.filter((a)=>a.serialNumber != null)
  let dev = hid.devices().filter((a)=>a.vendorId === 1406 && typeof joycons.find((b)=>b.serialNumber === a.serialNumber) === 'undefined')
  while(controllerPool.length < dev.length) {
    controllerPool.push(new WindowsController(vgen))
  }
  joycons = joycons.concat(dev.map((a)=>{return new Joycon(a.path,controllerPool.shift(),a.serialNumber)}))
},1000)
*/
let finalized = false;
process.on('exit',()=>{
    if(!finalized) {
        joycons.forEach((joy) => {
            //controllerPool.push(joy.releaseController())
            // joy.finalize();
        });
        /*controllerPool.forEach((con)=>{
            con.finalize();
        })*/
        finalized = true;
    }
});
process.on('SIGINT',()=>{
    if(!finalized) {
        joycons.forEach((joy) => {
            //controllerPool.push(joy.releaseController())
            joy.finalize();
        });
        /*controllerPool.forEach((con)=>{
            con.finalize();
        })*/
        finalized = true;
    }
    process.exit();
});
