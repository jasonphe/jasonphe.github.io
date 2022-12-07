
let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
let baseWidth = 1280;
let baseHeight = 720;
let imgDict = {};
let audioDict = {};
let oldTimeStamp;
function setTimestamp(timeStamp) { oldTimeStamp = timeStamp; }

export { canvas, ctx, baseHeight, baseWidth, imgDict, audioDict, oldTimeStamp, setTimestamp };