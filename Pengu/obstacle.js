class Obstacle extends Collider {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.enabled = true;
    }

    static speedX = 1;

    canDraw() {
        if (this.x > canvas.width || this.x + this.w < 0) {
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
    constructor(x, y, w, h, value, type) {
        super(x, y, w, h);
        this.value = value;
        this.type = type;
    }

    draw() {
        ctx.beginPath();
        ctx.lineWidth = "6";
        ctx.strokeStyle = "red";
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
        player.addPengus(this.value);
    }
}