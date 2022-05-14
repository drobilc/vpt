// #part /glsl/mixins/XYZColorMatching

// Approximations for XYZ color matching functions from paper "Simple Analytic
// Approximations to the CIE XYZ Color Matching Functions".
// https://jcgt.org/published/0002/02/01/

float S(float x, float y, float z) {
    return x < 0.0 ? y : z;
}

float X(float x) {
    float dx1 = x - 442.0;
    float v1 = dx1 * S(dx1, 0.0624, 0.0374);
    float dx2 = x - 599.8;
    float v2 = dx2 * S(dx2, 0.0264, 0.0323);
    float dx3 = x - 501.1;
    float v3 = dx3 * S(dx3, 0.0490, 0.0382);
    return 0.362 * exp(0.5 * v1 * v1) + 1.056 * exp(0.5 * v2 * v2) - 0.065 * exp(0.5 * v3 * v3);
}

float Y(float x) {
    float dx1 = x - 568.8;
    float v1 = dx1 * S(dx1, 0.0213, 0.0247);
    float dx2 = x - 530.9;
    float v2 = dx2 * S(dx2, 0.0613, 0.0322);
    return 0.821 * exp(0.5 * v1 * v1) + 0.286 * exp(0.5 * v2 * v2);
}

float Z(float x) {
    float dx1 = x - 437.0;
    float v1 = dx1 * S(dx1, 0.0845, 0.0278);
    float dx2 = x - 459.0;
    float v2 = dx2 * S(dx2, 0.0385, 0.0725);
    return 1.217 * exp(0.5 * v1 * v1) + 0.681 * exp(0.5 * v2 * v2);
}