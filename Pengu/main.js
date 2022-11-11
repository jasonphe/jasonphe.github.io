var imgFolder = "assets/";
var canvas = document.getElementById('game');

let imgsToLoad = ["right"];
let imgDict = {};
let keys = [];
let counter = 0;
var ctx = canvas.getContext('2d');

let baseWidth = 1280;
let baseHeight = 720;
canvas.width = baseWidth;
canvas.height = baseHeight;