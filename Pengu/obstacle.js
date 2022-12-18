import { Collider } from "./collider.js";
import { shuffle } from "./util.js";
import { canvas, ctx, baseWidth, baseHeight, oldTimeStamp, audioDict, imgDict } from "./globals.js";

export class Obstacle extends Collider {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.enabled = true;
        this.destroyed = false;
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
        ctx.lineWidth = 6;
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
        ctx.lineWidth = 4;
        ctx.globalAlpha = this.alpha;
        let gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y);
        gradient.addColorStop(0, "#ADD8E6");
        gradient.addColorStop(1, "blue");
        ctx.fillStyle = gradient;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        ctx.beginPath();
        ctx.strokeStyle = "black";
        ctx.lineWidth = 6;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.w, this.y);
        ctx.stroke();
        ctx.moveTo(this.x, this.y + this.h);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.stroke();

        ctx.font = "700 20pt Verdana"
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
        //shuffle(coords)
        coords.forEach(props => {
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

export class FinishLine extends Obstacle {
    constructor(x) {
        super(x, 0, 30, baseHeight);
    }

    draw() {
        ctx.lineWidth = 4;
        let gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y);
        gradient.addColorStop(0, "#ADD8E6");
        gradient.addColorStop(1, "green");
        ctx.fillStyle = gradient;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        ctx.beginPath();
        ctx.strokeStyle = "black";
        ctx.lineWidth = 6;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.w, this.y);
        ctx.stroke();
        ctx.moveTo(this.x, this.y + this.h);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.stroke();
    }

    trigger() {
        return { value: 0, type: "finish" };
    }
}

export class Spike extends Obstacle {
    constructor(x, yRatio, w, hRatio, roam = false) {
        super(x, yRatio * baseHeight, w, hRatio * baseHeight);
        this.origY = yRatio * baseHeight;
        this.dirY = "down";
        this.roam = roam;
    }

    draw() {
        if (this.destroyed) {
            let frame = Math.floor(oldTimeStamp/200) % 3;
            let image = imgDict[`destroy${frame}`];
            ctx.drawImage(image, 0, 0, image.width, image.height, this.x, this.y, this.w, this.h);
            return;
        }
        let image = imgDict["spike"];
        ctx.drawImage(image, 0, 0, image.width, image.height, this.x, this.y, this.w, this.h);
        /*ctx.beginPath();
        ctx.strokeStyle = "black";
        ctx.strokeRect(this.x, this.y, this.w, this.h);*/
    }

    move(elapsedMS) {
        super.move(elapsedMS);
        if (this.roam) {
            this.y += (this.dirY == "up" ? -1 : 1) * elapsedMS * .02;
            if ((this.origY - this.y >= 40) || (this.y <= 0)) {
                this.dirY = "down";
            } else if ((this.origY - this.y < -40) || (this.y + this.h >= baseHeight)) {
                this.dirY = "up";
            }
        }
    }

    trigger() {
        return { value: -5, type: "spike" };
    }
}

export class Orca extends Obstacle {
    constructor(x, yRatio, w, hRatio, roam = false) {
        super(x, yRatio * baseHeight, w, hRatio * baseHeight);
        this.origY = yRatio * baseHeight;
        this.dirY = "up";
        this.roam = roam;
    }

    draw() {
        if (this.destroyed) {
            let frame = Math.floor(oldTimeStamp/200) % 3;
            let image = imgDict[`destroy${frame}`];
            ctx.drawImage(image, 0, 0, image.width, image.height, this.x, this.y, this.w, this.h);
            return;
        }

        let frame = Math.floor(oldTimeStamp/200) % 5;
        let image = imgDict["orca"];
        let adjust = 1.5;
        ctx.drawImage(image, 0, frame * (image.height/5), image.width, image.height/5, 
            this.x - (this.w * adjust - this.w)/2, this.y - (this.h * adjust - this.h)/2, this.w * adjust, this.h * adjust);
       /* ctx.beginPath();
        ctx.strokeStyle = "black";
        ctx.strokeRect(this.x, this.y, this.w, this.h);*/
    }

    move(elapsedMS) {
        super.move(elapsedMS);
        if (this.roam) {
            this.y += (this.dirY == "up" ? -1 : 1) * elapsedMS * .02;
            if ((this.origY - this.y >= 40) || (this.y <= 0)) {
                this.dirY = "down";
            } else if ((this.origY - this.y < -40) || (this.y + this.h >= baseHeight)) {
                this.dirY = "up";
            }
        }
    }

    trigger() {
        return { value: -9999, type: "orca" };
    }
}

export class PowerUp extends Obstacle {
    constructor(x, type) {
        super(x, baseHeight, 100, 100);
        this.type = type;
        this.origX = x;
    }

    draw() {
        if (this.enabled) {
            let image = imgDict[this.type];
            if (image) {
                let scaledSize = this.w * .7;
                ctx.drawImage(image, 0, 0, image.width, image.height, 
                    this.x + this.w/2 - scaledSize/2, this.y + this.h/2 - scaledSize/2, scaledSize, scaledSize);
            }

            ctx.beginPath();
            ctx.arc(this.x + this.w/2, this.y + this.h/2, this.w/2, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.beginPath();
            ctx.fillStyle = "white"
            ctx.arc(this.x + this.w/4, this.y + this.h/4, 5, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    move(elapsedMS) {
        super.move(elapsedMS);
        if (this.x > baseWidth) {
            return;
        }
        this.y -= elapsedMS * .15;
        /*if (this.origY - this.y >= 40) {
            this.dirY = "down";
        } else if (this.origY - this.y <= 0) {
            this.dirY = "up";
        }*/
    }

    trigger() {
        this.enabled = false;
        return { type: "powerUp", powerType: this.type };
    }
}