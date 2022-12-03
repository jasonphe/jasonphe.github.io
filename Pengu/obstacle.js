import { Collider } from "./collider.js";
import { shuffle } from "./util.js";
import { canvas, ctx, baseWidth, baseHeight } from "./canvas.js";

export class Obstacle extends Collider {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.enabled = true;
    }

    static speedX = 1.3;

    canDraw() {
        if (this.x > baseWidth || this.x + this.w < 0) {
            return false;
        }
        return true;
    }

    draw() {
        if (!this.canDraw())
        {
            return;
        }
        ctx.beginPath();
        ctx.lineWidth = "6";
        ctx.strokeStyle = "red";
        ctx.rect(this.x, this.y, this.w, this.h);
        ctx.stroke();
    }

    move() {
        this.x -= Obstacle.speedX;
    }
    
    isOut() {
        return this.x + this.w < 0;
    }
    
    trigger() {

    }
}

export class Gate extends Obstacle {
    constructor(x, y, w, h, value, type, parent) {
        super(x, y, w, h);
        this.value = value;
        this.type = type;
        this.parent = parent;
    }

    draw() {
        ctx.beginPath();
        ctx.lineWidth = "6";
        ctx.strokeStyle = this.enabled ? "green" : "red";
        ctx.rect(this.x, this.y, this.w, this.h);
        ctx.stroke();
        
        ctx.fillStyle = "yellow";
        ctx.textAlign="center";
        ctx.textBaseline = "middle";
        let valueText = "";
        if (this.type === "add") {
            valueText = this.value > 0 ? "+" + this.value : this.value;
        }
        else if (this.type === "multiply") {
            valueText = "X"+ this.value;
        }
        
        ctx.fillText(valueText, this.x + this.w/2, this.y + this.h/2);
    }

    trigger() {
        this.enabled = false;
        if (this.parent) {
            this.parent.setEnabled(false);
        }
        return { value: this.value, type: this.type };
    }
}

export class GateParent {
    constructor(x, coords) {
        this.x = x;
        this.y = 0;
        this.gates = [];
        shuffle(coords).forEach(element => {
            this.addGate(element.heightRatio, element.value, element.type);
        })
    }

    addGate(heightRatio, value, type) {
        if (this.y >= baseHeight) {
            console.log("No more room for gates");
            return;
        }
        let height = Math.min(baseHeight - this.y, heightRatio * baseHeight);
        this.gates.push(new Gate(this.x, this.y, 50, height, value, type, this));
        this.y += height;
    }

    setEnabled(isEnabled) {
        this.gates.forEach(element => {
            element.enabled = isEnabled;
        });
    }
}