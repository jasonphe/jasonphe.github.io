
let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
let baseWidth = 1280;
let baseHeight = 720;
let imgDict = {};
let audioDict = {};
let oldTimeStamp;
function setTimestamp(timeStamp) { oldTimeStamp = timeStamp; }

function textWithOutline(text, x, y, fontSize = 36, align="left", base="alphabetic") {
    ctx.lineWidth = 2;
    ctx.font = `600 ${fontSize}px Verdana`;
    ctx.textAlign= align;
    ctx.textBaseline = base; 
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.fillText(text, x, y);
    ctx.strokeText(text, x, y);
}

function drawImgRatio(image, destX, destY, destW, destH) {
    let scaleW = Math.min(1, image.width / image.height);
    let scaleH = Math.min(1, image.height / image.width);
    ctx.drawImage(image, 0, 0, image.width, image.height, destX, destY, destW * scaleW, destH * scaleH);
}

export { canvas, ctx, baseHeight, baseWidth, imgDict, audioDict, oldTimeStamp, setTimestamp, textWithOutline, drawImgRatio };