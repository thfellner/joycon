const buttonsInSVG  = {
    x: [document.getElementById("path3867"), document.getElementById("path3948")],
    y: [document.getElementById("path3865"), document.getElementById("path3950")],
    b: [document.getElementById("path3869"), document.getElementById("path3952")],
    a: document.getElementById("path3095"),
    plus: [document.getElementById("path3093"), document.getElementById("path3942")],
    R: [document.getElementById("path4168"), document.getElementById("path3818"), document.getElementById("path3926")],
    ZR: [document.getElementById("path4166"), document.getElementById("path3930")],
    up: [document.getElementById("path3871"), document.getElementById("path4046")],
    down: [document.getElementById("path3873"), document.getElementById("path4050")],
    left: document.getElementById("path3875"),
    right: [document.getElementById("path3877"), document.getElementById("path4048")],
    capture: [document.getElementById("rect3919"), document.getElementById("rect4044")],
    minus: [document.getElementById("rect3890"), document.getElementById("rect4052")],
    L: [document.getElementById("path4164"), document.getElementById("path3832"), document.getElementById("path4008")],
    ZL: [document.getElementById("path4162"), document.getElementById("path4000")]
};

const leftStick = {
    outerRing: document.getElementById("path3907"),
    innerRing: document.getElementById("path3909"),
    rightLine: document.getElementById("path3915"),
    upperLine: document.getElementById("path3911"),
    leftLine: document.getElementById("path3917"),
    lowerLine: document.getElementById("path3913")
};

const rightStick = {
    outerRing: document.getElementById("path3888"),
    innerRing: document.getElementById("path3892"),
    rightLine: document.getElementById("path3903"),
    upperLine: document.getElementById("path3899"),
    leftLine: document.getElementById("path3905"),
    lowerLine: document.getElementById("path3901")
};

const specialCases = {
    home: document.getElementById("path3881"),
    SL: [document.getElementById("rect4034"), document.getElementById("rect3964")],
    SR: [document.getElementById("rect4032"), document.getElementById("rect3966")],
    leftStickHorz: leftStick,
    leftStickVert: leftStick,
    rightStickHorz: rightStick,
    rightStickVert: rightStick
};

function getPathTranslate(domElement) {
    // Getting
    let xforms = domElement.transform.baseVal; // An SVGTransformList
    if (xforms.length > 0) {
        let firstXForm = xforms.getItem(0);       // An SVGTransform
        let firstX = firstXForm.matrix.e,
            firstY = firstXForm.matrix.f;

        console.log(firstXForm.matrix)

        /*return {
            x: firstX,
            y: firstY
        }*/
        return firstXForm.matrix.translate(0, 0);
    }
    const newSVGMatrix = document.createElementNS("http://www.w3.org/2000/svg", "svg").createSVGMatrix();
    xforms.appendItem(xforms.createSVGTransformFromMatrix(newSVGMatrix));
    return newSVGMatrix.translate(0, 0);
}

const leftStickPosition = {
    outerRing: getPathTranslate(leftStick.outerRing),
    innerRing: getPathTranslate(leftStick.innerRing),
    rightLine: getPathTranslate(leftStick.rightLine),
    upperLine: getPathTranslate(leftStick.upperLine),
    leftLine: getPathTranslate(leftStick.leftLine),
    lowerLine: getPathTranslate(leftStick.lowerLine)
};

const rightStickPosition = {
    outerRing: getPathTranslate(rightStick.outerRing),
    innerRing: getPathTranslate(rightStick.innerRing),
    rightLine: getPathTranslate(rightStick.rightLine),
    upperLine: getPathTranslate(rightStick.upperLine),
    leftLine: getPathTranslate(rightStick.leftLine),
    lowerLine: getPathTranslate(rightStick.lowerLine)
};

function editJoyConIllustration(data) {
    if (data.type === 2) {
        Object.keys(leftStick).forEach(e => {
            if(leftStick[e].transform.baseVal.length > 0) {
                const mat = leftStickPosition[e].translate((isNaN(data.leftStickHorz) ? 0 : data.leftStickHorz * 10/leftStickPosition[e].a), (isNaN(data.leftStickVert) ? 0 : data.leftStickVert * -10/leftStickPosition[e].a));
                leftStick[e].transform.baseVal.getItem(0).setMatrix(mat);
            }
        });

    } else if (data.type === 3) {
        Object.keys(rightStick).forEach(e => {
            if(rightStick[e].transform.baseVal.length > 0) {
                const mat = rightStickPosition[e].translate((isNaN(data.rightStickHorz) ? 0 : data.rightStickHorz * 10/rightStickPosition[e].a), (isNaN(data.rightStickVert) ? 0 : data.rightStickVert * -10/rightStickPosition[e].a));
                rightStick[e].transform.baseVal.getItem(0).setMatrix(mat);
            }
        });
    }
    Object.keys(data).forEach(e => {
        if (Object.keys(buttonsInSVG).indexOf(e) > -1) {
            if (buttonsInSVG[e] instanceof Array) {
                buttonsInSVG[e].forEach(instanceOfButton => {
                    instanceOfButton.style.fill = data[e] ? "#999999" : "#44484c";
                });
            } else {
                buttonsInSVG[e].style.fill = data[e] ? "#999999" : "#44484c";
            }
        } else {
            switch (e) {
                case "home":
                    specialCases[e].style.fill = data[e] ? "#999999" : "#3a3d40";
                    break;
                case "SR":
                case "SL":
                    specialCases[e][data.type - 2].style.fill = data[e] ? "#d3d3d3" : "#999595";
                    break;
            }
        }
    });
}