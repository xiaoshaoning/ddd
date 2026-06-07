#include <stdio.h>

int global_counter = 0;

void increment_counter() {
    global_counter++;
}

int compute_sum(int n) {
    int sum = 0;
    for (int i = 1; i <= n; i++) {
        sum += i;
    }
    return sum;
}

int main() {
    int x = 10;
    int y = 20;
    int z = 0;

    // Phase 1: z changes multiple times - good for watchpoints
    z = x + y;           // z becomes 30
    increment_counter(); // global_counter becomes 1
    z = z * 2;           // z becomes 60
    increment_counter(); // global_counter becomes 2
    z = z - 15;          // z becomes 45

    // Phase 2: loop modifies sum - watch sum changing
    int result = compute_sum(5);

    printf("z = %d\n", z);
    printf("global_counter = %d\n", global_counter);
    printf("result = %d\n", result);

    return 0;
}
