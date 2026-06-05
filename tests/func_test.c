#include <stdio.h>

int multiply(int x, int y) {
    int result = x * y;
    return result;
}

int add(int a, int b) {
    int sum = a + b;
    return sum;
}

int compute(int p, int q, int r) {
    int step1 = multiply(p, q);
    int step2 = add(step1, r);
    return step2;
}

int main() {
    int a = 3;
    int b = 4;
    int c = 5;

    int m = multiply(a, b);
    int s = add(m, c);
    int result = compute(a, b, c);

    printf("multiply(%d, %d) = %d\n", a, b, m);
    printf("add(%d, %d) = %d\n", m, c, s);
    printf("compute(%d, %d, %d) = %d\n", a, b, c, result);

    return 0;
}
