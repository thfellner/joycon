/**
 * @class
 */
let hid = require('node-hid')
let net = require('net');
let sockets = [];
let index = require('./index');

let server = net.createServer(function(socket) {
    sockets.push(socket);
    socket.pipe(socket);
});

server.listen(9898, '127.0.0.1');

function getObjectDiff(obj1, obj2) {
    let returnObj = {};
    Object.keys(obj2).forEach(e => {
        if (obj1[e] !== obj2[e]) {
            if (typeof(obj1[e]) === 'object' && typeof(obj2[e]) === 'object') {
                returnObj[e] = getObjectDiff(obj1[e], obj2[e]);
            } else {
                returnObj[e] = obj2[e];
            }
        }
    });
    return returnObj;
}

function isEquivalent(obj1, obj2) {
    // Create arrays of property names
    let aProps = Object.getOwnPropertyNames(obj1);
    let bProps = Object.getOwnPropertyNames(obj2);

    // If number of properties is different,
    // objects are not equivalent
    if (aProps.length !== bProps.length) {
        return false;
    }

    for (let i = 0; i < aProps.length; i++) {
        let propName = aProps[i];

        // If values of same property are not equal,
        // objects are not equivalent
        if (obj1[propName] !== obj2[propName]) {
            return false;
        }
    }

    // If we made it this far, objects
    // are considered equivalent
    return true;
}

class Joycon {
    /**
     *
     * @param {string} path - The node-hid path to connect to.
     * @param {string} serialNumber
     */
    constructor(path,serialNumber) {
        this.SINGLE_MODE = 0;
        this.DUAL_MODE = 1;
        this.LEFT = 2;
        this.RIGHT = 3;
        this.lastPressedButtons = {};
        /**
         * @type {Joycon}
         */
        this.pairing = null;
        this.hidDevice = new hid.HID(path);
        this.serialNumber = serialNumber;
        this.mode = null;
        this.commandCallbacks = {};
        this.type = null;
        this.calibrationData = {
            leftStick:{},
            rightStick:{}
        }
        this.buttons = {};
        this.initialized = false;
        this.hidDevice.on('data',this.onData.bind(this));
        this.hidDevice.on('error',(e)=>{
            console.log(e);
            this.serialNumber = null
        })
        this.setLights([],[false,false,false,true]);
        this.initializationPromise = this.getJoyConInfo();
        this.initializationPromise.then(()=>this.initialized = true);
        this.initializationPromise.catch((e)=>console.log(e));
    }
    async waitUntilInitialized() {
        await this.initializationPromise;
    }
    async setPlayerLights(player) {
        await this.setLights([player > 0,player> 1,player> 2,player> 3],[]);
    }
    async setPairingLight() {
        await this.setLights([],[false,false,false,true]);
    }
    wait(millis) {
        return new Promise((f,r)=>{
            setTimeout(f,millis);
        })
    }
    async getJoyConInfo() {
        await this.wait(1000);
        let response = await this.sendSubcommand(0x02,Buffer.alloc(0));
        if(response[2] === 1) {
            this.type = this.LEFT;
        }
        if(response[2] === 2) {
            this.type = this.RIGHT;
        }
        await this.calibrateStick();
        setTimeout(async ()=>{await this.sendSubcommand(0x03,Buffer.from([0x30]))},1000);
    }
    async calibrateLeftStick() {
        let bytes = await this.readSPIAddress(0x603D,9);
        this.calibrationData.leftStick.xNom = (bytes[4] << 8) & 0xF00 | bytes[3];
        this.calibrationData.leftStick.yNom = (bytes[5] << 4) | (bytes[4] >> 4);
        this.calibrationData.leftStick.xMax = this.calibrationData.leftStick.xNom + (bytes[1] << 8) & 0xF00 | bytes[0];
        this.calibrationData.leftStick.yMax = this.calibrationData.leftStick.yNom + (bytes[2] << 4) | (bytes[1] >> 4);
        this.calibrationData.leftStick.xMin = this.calibrationData.leftStick.xNom - (bytes[7] << 8) & 0xF00 | bytes[6];
        this.calibrationData.leftStick.yMin = this.calibrationData.leftStick.yNom - (bytes[8] << 4) | (bytes[7] >> 4);
    }
    async calibrateRightStick() {
        let bytes = await this.readSPIAddress(0x6046,9);
        this.calibrationData.rightStick.xNom = (bytes[1] << 8) & 0xF00 | bytes[0];
        this.calibrationData.rightStick.yNom = (bytes[2] << 4) | (bytes[1] >> 4);
        this.calibrationData.rightStick.xMin = this.calibrationData.rightStick.xNom - (bytes[4] << 8) & 0xF00 | bytes[3];
        this.calibrationData.rightStick.yMin = this.calibrationData.rightStick.yNom - (bytes[5] << 4) | (bytes[4] >> 4);
        this.calibrationData.rightStick.xMax = this.calibrationData.rightStick.xNom + (bytes[7] << 8) & 0xF00 | bytes[6];
        this.calibrationData.rightStick.yMax = this.calibrationData.rightStick.yNom + (bytes[8] << 4) | (bytes[7] >> 4);
    }
    async calibrateStick() {
        if(this.type === this.LEFT) {
            await this.calibrateLeftStick();
        }
        else if(this.type === this.RIGHT) {
            await this.calibrateRightStick();
        }
        else {
            await this.calibrateLeftStick();
            await this.calibrateRightStick();
        }
    }
    async readSPIAddress(address,length) {
        if(length > 0x1D) {
            throw new Error("Max length for read is 0x1D");
        }
        let params = Buffer.alloc(5);
        params.writeInt32LE(address,0);
        params.writeInt8(length,4);
        let readout = await this.sendSubcommand(0x10,params);
        if(readout.readInt32LE(0) !== address || readout.readInt8(4) !== length) return null;
        return readout.slice(5);
    }

    /**
     * @param {number} command
     * @param {Buffer} parameters
     * @returns {Promise<Buffer>}
     */
    sendSubcommand(command,parameters) {
        return new Promise((f,r)=>{
            let fullCommand = Buffer.concat([Buffer.from([command]),parameters,Buffer.from([parameters.length])],parameters.length+2);
            this.hidDevice.write([0x1,0x1,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,...fullCommand]);
            this.commandCallbacks[command] = (msg) => {
                f(msg.slice(1).slice(14,49));
            }
        })
    }

    /**
     * Call on program exit
     */
    finalize() {
        this.hidDevice.write([0x1,0x1,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x06,0x0,0x1]);
    }

    /**
     *
     * @param {boolean[]} lightArray - Which lights to turn solid. Overrides flashArray for specific LEDs
     * @param {boolean[]} flashArray - Which lights to flash
     */
    async setLights(lightArray,flashArray) {
        let arg = 0;
        arg += lightArray.reduce((curr,item,i)=>curr+((item ? 1:0)*Math.pow(2,i)),0);
        arg += flashArray.reduce((curr,item,i)=>curr+((item ? 1:0)*Math.pow(2,i+4)),0);
        await this.sendSubcommand(0x30,Buffer.from([arg]));
    }
    onData(msg) {
        //console.log(msg);
        if(msg[0] === 0x21) {
            if(typeof this.commandCallbacks[msg[14]] === 'function') this.commandCallbacks[msg[14]](msg);
            return;
        }
        if(msg[0] !== 0x3F && msg[0] !== 0x30) return;
        if(this.type == null) return;
        let mode;
        if(typeof this.mode === 'undefined') mode = this.SINGLE_MODE;
        else mode = this.mode;
        //SWITCH BASED ON MESSAGE TYPE
        let buttons;
        if(msg[0] === 0x3F) {
            buttons = this.interpretHidInput(msg);
        }
        else if(msg[0] === 0x30) {
            buttons = this.interpretFullInput(msg.slice(1));
        }
        //END SWITCH
        let transformed = this.mapButtonsForMode(buttons,mode);
        if(typeof this.mode !== 'undefined' && this.controller) {
            if(typeof transformed.a !== 'undefined') this.controller.buttonA(transformed.a);
            if(typeof transformed.b !== 'undefined') this.controller.buttonB(transformed.b);
            if(typeof transformed.x !== 'undefined') this.controller.buttonX(transformed.x);
            if(typeof transformed.y !== 'undefined') this.controller.buttonY(transformed.y);
            if(typeof transformed.up !== 'undefined') this.controller.dPad(transformed.up,transformed.down,transformed.left,transformed.right);
            if(typeof transformed.leftStickHorz !== 'undefined') {
                if(this.mode === this.SINGLE_MODE) {
                    this.controller.leftStick(transformed.leftStickVert*(-1),transformed.leftStickHorz);
                }
                else {
                    this.controller.leftStick(transformed.leftStickHorz,transformed.leftStickVert);
                }
            }
            if(typeof transformed.rightStickHorz !== 'undefined') {
                if(this.mode === this.SINGLE_MODE) {
                    this.controller.leftStick(transformed.rightStickVert,transformed.rightStickHorz*(-1));
                }
                else {
                    this.controller.rightStick(transformed.rightStickHorz,transformed.rightStickVert);
                }
            }
            if(this.mode === this.SINGLE_MODE) {
                if(typeof transformed.SL !== 'undefined') this.controller.leftButton(transformed.SL);
                if(typeof transformed.SR !== 'undefined') this.controller.rightButton(transformed.SR);
            }
            else {
                if(typeof transformed.L !== 'undefined') this.controller.leftButton(transformed.L);
                if(typeof transformed.R !== 'undefined') this.controller.rightButton(transformed.R);
                if(typeof transformed.ZL !== 'undefined') this.controller.leftTrigger(transformed.ZL);
                if(typeof transformed.ZR !== 'undefined') this.controller.rightTrigger(transformed.ZR);
            }
        }
        Object.assign(this.buttons,transformed)
    }
    ignoreMinorChange(pressedButtons) {
        if (this.type === this.LEFT) {
            if (Math.abs(pressedButtons.leftStickVert) < 0.08) {
                delete pressedButtons.leftStickVert;
            }
            if (Math.abs(pressedButtons.leftStickHorz) < 0.08) {
                delete pressedButtons.leftStickHorz;
            }
        } else if (this.type === this.RIGHT) {
            if (Math.abs(pressedButtons.rightStickVert) < 0.08) {
                delete pressedButtons.rightStickVert;
            }
            if (Math.abs(pressedButtons.rightStickHorz) < 0.08) {
                delete pressedButtons.rightStickHorz;
            }
        }
        return pressedButtons;
    }
    mapButtonsForMode(buttons,mode) {
        let {up, down, left, right, ...newButtons} = buttons;
        let upKey = mode === this.SINGLE_MODE ? 'x':(this.type === this.LEFT ? 'right':'y');
        let downKey = mode === this.SINGLE_MODE ? 'b':(this.type === this.LEFT ? 'left':'a');
        let leftKey = mode === this.SINGLE_MODE ? 'y':(this.type === this.LEFT ? 'up':'b');
        let rightKey = mode === this.SINGLE_MODE ? 'a':(this.type === this.LEFT ? 'down':'x');

        let pressedButtons;
        if (this.type === this.LEFT) {
            pressedButtons = Object.assign({},newButtons,{
                up:left,
                down:right,
                left:down,
                right:up
            });
        } else if (this.type === this.RIGHT) {
            pressedButtons = Object.assign({},newButtons,{
                [upKey]:right,
                [downKey]:left,
                [leftKey]:up,
                [rightKey]:down
            });
        }

        let minorChangeIgnoredButtons = this.ignoreMinorChange(pressedButtons);
        if (!isEquivalent(this.lastPressedButtons, minorChangeIgnoredButtons)) {
            sockets.forEach(async (socket) => {
                socket.write(JSON.stringify(pressedButtons) + "\n");
            });

            index.socketIOConnections.forEach((ioSocket) => {
                let pressedButtonsDifference = getObjectDiff(this.lastPressedButtons, minorChangeIgnoredButtons);
                if (this.type === this.LEFT) {
                    pressedButtonsDifference.leftStickVert = pressedButtons.leftStickVert;
                    pressedButtonsDifference.leftStickHorz = pressedButtons.leftStickHorz;
                } else if (this.type === this.RIGHT) {
                    pressedButtonsDifference.rightStickVert = pressedButtons.rightStickVert;
                    pressedButtonsDifference.rightStickHorz = pressedButtons.rightStickHorz;
                }
                pressedButtonsDifference.type = this.type;
                ioSocket.emit('joyconData', pressedButtonsDifference);
            });
        }

        this.lastPressedButtons = minorChangeIgnoredButtons;

        pressedButtons = Object.assign({},newButtons,{
            [upKey]:up,
            [downKey]:down,
            [leftKey]:left,
            [rightKey]:right
        });

        return pressedButtons;
    }
    interpretHidInput(msg) {
        //All directions are relative to Single-Mode
        let L = {
            L: !!(msg[2] & 0x40),
            ZL: !!(msg[2] & 0x80)
        };
        let R = {
            R: !!(msg[2] & 0x40),
            ZR: !!(msg[2] & 0x80)
        };
        let typeBased = this.type === this.LEFT ? L : R;
        return Object.assign({
            down: !!(msg[1] & 0x01),
            right:!!(msg[1] & 0x02),
            left:!!(msg[1] & 0x04),
            up:!!(msg[1] & 0x08),
            SL:!!(msg[1] & 0x10),
            SR:!!(msg[1] & 0x20),
            minus:!!(msg[2] & 0x01),
            plus:!!(msg[2] & 0x02),
            leftStickClick:!!(msg[2] & 0x04),
            rightStickClick:!!(msg[2] & 0x08),
            home:!!(msg[2] & 0x10),
            capture:!!(msg[2] & 0x20)
        },typeBased);
    }
    interpretFullInput(msg) {
        let stickData = msg.slice((this.type === this.LEFT ? 5:8),(this.type === this.LEFT ? 5:8)+3);
        let stickHorizontal = stickData[0] | ((stickData[1] & 0xF) << 8);
        let stickVertical = (stickData[1] >> 4) | (stickData[2] << 4);
        let L = {
            L: !!(msg[4] & 0x40),
            ZL: !!(msg[4] & 0x80),
            leftStickHorz:(stickHorizontal - this.calibrationData.leftStick.xNom)/Math.abs((this.calibrationData.leftStick.xNom < stickHorizontal ? this.calibrationData.leftStick.xMax:this.calibrationData.leftStick.xMin) - this.calibrationData.leftStick.xNom),
            leftStickVert:(stickVertical - this.calibrationData.leftStick.yNom)/Math.abs((this.calibrationData.leftStick.yNom < stickVertical ? this.calibrationData.leftStick.yMax:this.calibrationData.leftStick.yMin) - this.calibrationData.leftStick.yNom),
            capture:!!(msg[3] & 0x20),
            leftStickClick:!!(msg[3] & 0x08),
            minus:!!(msg[3] & 0x01),
        };
        let R = {
            R: !!(msg[2] & 0x40),
            ZR: !!(msg[2] & 0x80),
            rightStickHorz:(stickHorizontal - this.calibrationData.rightStick.xNom)/Math.abs((this.calibrationData.rightStick.xNom < stickHorizontal ? this.calibrationData.rightStick.xMax:this.calibrationData.rightStick.xMin) - this.calibrationData.rightStick.xNom),
            rightStickVert:(stickVertical - this.calibrationData.rightStick.yNom)/Math.abs((this.calibrationData.rightStick.yNom < stickVertical ? this.calibrationData.rightStick.yMax:this.calibrationData.rightStick.yMin) - this.calibrationData.rightStick.yNom),
            home:!!(msg[3] & 0x10),
            rightStickClick:!!(msg[3] & 0x04),
            plus:!!(msg[3] & 0x02),
        };
        let typeBased = (this.type === this.LEFT ? L:R);
        return Object.assign({
            down: !!((msg[2] | msg[4]) & 0x08),
            right: (!!(msg[2] & 0x02)) || (!!(msg[4] & 0x01)),
            left: (!!(msg[2] & 0x04)) || (!!(msg[4] & 0x02)),
            up: (!!(msg[2] & 0x01)) || (!!(msg[4] & 0x04)),
            SR: !!((msg[2] | msg[4]) & 0x10),
            SL: !!((msg[2] | msg[4]) & 0x20),
        },typeBased);
    }
    releaseController() {
        this.controller = null;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
module.exports = Joycon;