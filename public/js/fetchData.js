let socket = io.connect(location.href);
let lastData = {};
socket.on('joyconData', (data)=> {
    editJoyConIllustration(data);
    lastData = data;
});