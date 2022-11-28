class Obstacle extends Collider {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.enabled = true;
    }

    static speedX = 1;

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

class Gate extends Obstacle {
    constructor(x, y, w, h, value, type, parent) {
        super(x, y, w, h);
        this.value = value;
        this.type = type;
        this.parent = parent;
    }

    draw() {
        ctx.beginPath();
        ctx.lineWidth = "6";
        if (this.enabled) {
            ctx.strokeStyle = this.enabled ? "green" : "red";
        }
        ctx.rect(this.x, this.y, this.w, this.h);
        ctx.stroke();

        ctx.fillStyle = "black";
        ctx.textAlign="center";
        ctx.textBaseline = "middle";
        let valueText = this.value > 0 ? "+" + this.value : this.value;
        ctx.fillText(valueText, this.x + this.w/2, this.y + this.h/2);
    }

    trigger() {
        this.enabled = false;
        if (this.parent) {
            this.parent.setEnabled(false);
        }
        player.addPengus(this.value);
    }
}

class GateParent {
    constructor(x, coords) {
        this.x = x;
        this.y = 0;
        this.gates = [];
        coords.forEach(element => {
            this.addGate(element.heightRatio, element.width, element.value, element.type);
        })
    }

    addGate(heightRatio, width, value, type) {
        if (this.y >= baseHeight) {
            console.log("No more room for gates");
            return;
        }
        let height = Math.min(baseHeight - this.y, heightRatio * baseHeight);
        this.gates.push(new Gate(this.x, this.y, width, height, value, type, this));
        this.y += height;
    }

    setEnabled(isEnabled) {
        this.gates.forEach(element => {
            element.enabled = isEnabled;
        });
    }
}