# Overview

This setup simulates 4 nodes on a single machine:

* **Agent**
* **Splitter**
* **Target 1**
* **Target 2**

Due to restrictions on modifying configuration files, all nodes use the same ports. Multiple loopback IPs are used to differentiate nodes.

# Setup

1. Add the following to `/etc/hosts`:

```
127.0.0.2 agent
127.0.0.3 splitter
127.0.0.4 target_1
127.0.0.5 target_2
```

2. Create loopback aliases:

```bash
sudo ifconfig lo0 alias 127.0.0.2 up
sudo ifconfig lo0 alias 127.0.0.3 up
sudo ifconfig lo0 alias 127.0.0.4 up
sudo ifconfig lo0 alias 127.0.0.5 up
```

3. Verify aliases:

```bash
ifconfig lo0
```

Expected output:

```
inet 127.0.0.2
inet 127.0.0.3
inet 127.0.0.4
inet 127.0.0.5
```

## Notes

Ideally, SSH commands and keys would be used to start each node on a remote host, hiding passwords. This simulation runs entirely locally.

Output files from targets are written to events.log and events_2.log to simulate separate hosts.

# Test Data

1M events file (large_1M_events.log) provided for main tests.

Additional smaller input files are included, with some containing empty lines.

# Behavior:

Tests with smaller files always pass.

Test with the 1M data file may occasionally fail due to local resource constraints (simulating network congestion).

# Test Suite (Jest)

Jest is used to structure and run the tests.

## Setup

Splitter and Target nodes start once before all tests and shut down after all tests.

Output files are cleaned up at the start of each test.

In each test case, a specific configuration directory is selected for different input files.


## Running the Tests
### Run all tests
> npm run test

### Run tests matching a specific name pattern
> npx jest --testNamePattern "#1:"

### Run all tests under the tests folder
> npx jest tests

