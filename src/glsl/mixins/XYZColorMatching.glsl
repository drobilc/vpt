// #part /glsl/mixins/XYZColorMatching

// Approximations for XYZ color matching functions from paper "Simple Analytic
// Approximations to the CIE XYZ Color Matching Functions".
// https://jcgt.org/published/0002/02/01/

const uint numberOfSamples = 32u;
const float startWavelength = 400.0;
const float endWavelength = 700.0;

float S(float x, float y, float z) {
    return x < 0.0 ? y : z;
}

float X31(float lambda) {
    float e1 = 1.065 * exp(-0.5 * pow((lambda - 595.8) / 33.33, 2.0));
    float e2 = 0.366 * exp(-0.5 * pow((lambda - 446.8) / 19.44, 2.0));
    return e1 + e2;
}

float Y31(float lambda) {
    return 1.014 * exp(-0.5 * pow((log(lambda) - log(556.3)) / 0.075, 2.0));
}

float Z31(float lambda) {
    return 1.839 * exp(-0.5 * pow((log(lambda) - log(449.8)) / 0.051, 2.0));
}

float X(float x) {
    float dx1 = x - 442.0;
    float v1 = dx1 * S(dx1, 0.0624, 0.0374);
    float dx2 = x - 599.8;
    float v2 = dx2 * S(dx2, 0.0264, 0.0323);
    float dx3 = x - 501.1;
    float v3 = dx3 * S(dx3, 0.0490, 0.0382);
    return 0.362 * exp(-0.5 * v1 * v1) + 1.056 * exp(-0.5 * v2 * v2) - 0.065 * exp(-0.5 * v3 * v3);
}

float Y(float x) {
    float dx1 = x - 568.8;
    float v1 = dx1 * S(dx1, 0.0213, 0.0247);
    float dx2 = x - 530.9;
    float v2 = dx2 * S(dx2, 0.0613, 0.0322);
    return 0.821 * exp(-0.5 * v1 * v1) + 0.286 * exp(-0.5 * v2 * v2);
}

float Z(float x) {
    float dx1 = x - 437.0;
    float v1 = dx1 * S(dx1, 0.0845, 0.0278);
    float dx2 = x - 459.0;
    float v2 = dx2 * S(dx2, 0.0385, 0.0725);
    return 1.217 * exp(-0.5 * v1 * v1) + 0.681 * exp(-0.5 * v2 * v2);
}

vec3 xyzResponseAt(float x) {
    return vec3(X31(x), Y31(x), Z31(x));
}

vec3 averageXYZResponseInBin(float fromLambda, float toLambda, uint subsamples) {
    return xyzResponseAt(fromLambda + ((toLambda - fromLambda) * 0.5));
}

float sum3(vec3 v) {
    return v.x + v.y + v.z;
}

vec3 spectrumToXYZ(float spectrum[numberOfSamples]) {

    vec3 XYZ[numberOfSamples];

    // Compute X(lambda), Y(lambda) and Z(lambda) response curves.
    // TODO: This should only be computed ONCE and not once per each pixel.
    float interval = endWavelength - startWavelength;
    float bucketSize = interval / float(numberOfSamples);
    for (uint i = 0u; i < numberOfSamples; i++) {
        float wavelength = startWavelength + float(i) * bucketSize;
        float nextWavelength = startWavelength + float(i + 1u) * bucketSize;
        XYZ[i] = 683.0 * averageXYZResponseInBin(wavelength, nextWavelength, 8u);
    }

    // Compute the integral / riemann sum of the spectrum multiplied with each
    // response curve.
    vec3 xyzColor = vec3(0.0, 0.0, 0.0);
    for (uint i = 0u; i < numberOfSamples; i++) {
        xyzColor += spectrum[i] * XYZ[i];
    }

    // Correctly scale the computed XYZ color.
    float scale = (endWavelength - startWavelength) / (float(numberOfSamples) * 106.856895);
    vec3 color = scale * xyzColor;
    
    // Compute the xyz coefficients from XYZ values.
    // return color / sum3(color);
    return color;

}