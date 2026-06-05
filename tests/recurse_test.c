#include <stdio.h>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    int rest = factorial(n - 1);
    return n * rest;
}

int fibonacci(int n) {
    if (n <= 1) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    int n = 5;

    int fact = factorial(n);
    printf("factorial(%d) = %d\n", n, fact);

    int fib = fibonacci(n);
    printf("fibonacci(%d) = %d\n", n, fib);

    return 0;
}
