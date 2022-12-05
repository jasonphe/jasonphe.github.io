import { Collider } from "./collider.js";
import { shuffle } from "./util.js";
import { canvas, ctx, baseWidth, baseHeight, oldTimeStamp, audioDict } from "./globals.js";

export class Obstacle extends Collider {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.enabled = true;
    }

    static speedX = .2;

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

    move(elapsedMS) {
        this.x -= Obstacle.speedX * elapsedMS;
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
        this.alpha = .8;
        this.parent = parent;
    }
    static fadeSpeed = .005;

    draw() {
        ctx.save();
        ctx.lineWidth = "4";
        ctx.globalAlpha = this.alpha;
        let gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y);
        gradient.addColorStop(0, "#ADD8E6");
        gradient.addColorStop(1, "blue");
        ctx.fillStyle = gradient;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        ctx.beginPath();
        ctx.fillStyle = "black";
        ctx.lineWidth = "6";
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.w, this.y);
        ctx.stroke();
        ctx.moveTo(this.x, this.y + this.h);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.stroke();

        ctx.fillStyle = "yellow";
        ctx.textAlign="center";
        ctx.textBaseline = "middle";
        let valueText = "";
        if (this.type === "add") {
            valueText = this.value > 0 ? "+" + this.value : this.value;
        }
        else if (this.type === "multiply") {
            valueText = "x"+ this.value;
        }
        
        ctx.fillText(valueText, this.x + this.w/2, this.y + this.h/2);
        ctx.restore();
    }

    move(elapsedMS) {
        super.move(elapsedMS);
        if (!this.enabled) {
            this.alpha = Math.max(this.alpha - Gate.fadeSpeed, 0);
        }
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
        shuffle(coords).forEach(props => {
            this.addGate(props);
        });
    }

    addGate(props) {
        if (this.y >= baseHeight) {
            console.log("No more room for gates");
            return;
        }
        let height = Math.min(baseHeight - this.y, props.heightRatio * baseHeight);
        this.gates.push(new Gate(this.x, this.y, 100, height, props.value, props.type, this));
        this.y += height;
    }

    setEnabled(isEnabled) {
        this.gates.forEach(element => {
            element.enabled = isEnabled;
        });
    }
}