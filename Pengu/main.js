var imgFolder = "assets/";
var canvas = document.getElementById('game');
/*let resW = 1280;
let resH = 720;
let devW = window.innerWidth;
let devH = window.innerHeight;*/

let imgsToLoad = ["right"];
let imgDict = {};
let keys = [];
let counter = 0;
/*let f = Math.max(window.innerWidth / resW, window.innerHeight / resH);
canvas.width = Math.floor(devW / f);
canvas.height = Math.floor(devH / f);
*/
canvas.style.width = '100%';
canvas.style.aspectRatio = 16/9;
//canvas.style.height = '100%';
var ctx = canvas.getContext('2d');
//ctx.canvas.width = 1000;
//ctx.canvas.height = 720 * 1000 / 1280;
let baseWidth = 1280;
let baseHeight = 720;
/*
sizeWindow();
window.addEventListener('resize', (event) => { sizeWindow(); });

function sizeWindow() {
    
if(window.innerWidth < baseWidth){
    //calculate adjustments
    //the base size is the minimum rendering size
    let adjustHeight = (100 / (window.innerHeight * 100 / baseHeight));
    let adjustWidth = (100 / (window.innerWidth * 100 / baseWidth));
    let adjust = adjustHeight;
    if(adjust > adjustWidth){
        adjust = adjustWidth;
    }
    
    // the adjust number must always be the same on height and width, otherwise your game will lose its proportions
    canvas.style.width = '' + window.innerWidth * adjust;
    canvas.style.height = '' + window.innerHeight * adjust;
}
}*/