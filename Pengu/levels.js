var levels = 
[
    {
        title: "1",
        gateParents: 
        [
            new GateParent(600, [
            {
                heightRatio: .25, 
                width: 20,
                value: 10, 
                type: "add"
            },
            {
                heightRatio: .25, 
                width: 40,
                value: -10, 
                type: "add"
            },
            {
                heightRatio: .65, 
                width: 40,
                value: 5, 
                type: "add"
            }]),
            new GateParent(1000, [
                {
                    heightRatio: .25, 
                    width: 20,
                    value: 10, 
                    type: "add"
                },
                {
                    heightRatio: .25, 
                    width: 40,
                    value: -10, 
                    type: "add"
                },
                {
                    heightRatio: .65, 
                    width: 40,
                    value: 5, 
                    type: "add"
                }]),
        ],
    },
    {
        title: "2",
        obstacles: [],
    }
];