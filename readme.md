[![GitHub release](https://badge.fury.io/js/node-health-agent.svg)](https://github.com/wallet77/node-health-agent/releases/)
[![GitHub license](https://img.shields.io/github/license/wallet77/node-health-agent)](https://github.com/wallet77/node-health-agent/blob/master/LICENSE)

# Purpose

Node agent for Node health project.

# Compatibility

**/!\ This module use async/await syntax and the inspector module, this is why you must have node 8.0+.**

Supported and tested : >= 8.0

| Version       | Supported     | Tested         |
|:-------------:|:-------------:|:--------------:|
| 12.x          | yes           | yes            |
| 10.x          | yes           | yes            |
| 9.x           | yes           | yes            |
| 8.x           | yes           | yes            |

**In order to have all features we recommend to use at least Node.js version 10 or higher.**

# Installation

```console
$ npm install node-health-agent --save
```

# Usage

## Basic
```javascript
const agent = require('node-health-agent')({
  appName: 'testAPI',
  serverUrl: 'ws://localhost:3001',
  inspector: {
    storage: {
      type: "s3",
      bucket: process.env.CONFIG_S3_BUCKET,
      dir: 'inspector'
    }
  }
})

```

## Add a custom event
```javascript
agent.addEvent('myEvent', (event) => {
  console.log(event)
})
```

### Add a custom event and send data to server
```javascript
agent.addEvent('myEvent', (event, ws) => {
  const data = ... // get data in any way
  event.data = data
  ws.send(JSON.stringify(event))
})
```

### Trigger event manually
```javascript
agent._events.cpu_profiling_start({}, agent.ws, agent.inspector)
// ...
// a few moment later
const profile = await agent._events.cpu_profiling_stop({}, agent.ws, agent.inspector)
```


# List of built-in events

| Event                        | description                                |
|:----------------------------:|:------------------------------------------:|
| `cpu_profiling_start`        | Start a CPU profiling                      |
| `cpu_profiling_stop`         | Stop a CPU profiling                       |
| `extract_env_var`            | Extract environment variables              |
| `extract_package_file`       | Extract package.json file content          |
| `extract_dependencies`       | Extract the full dependencies tree         |
| `memory_dump`                | Take a memory snapshot                     |
| `memory_sampling_start`      | Start a memory sampling                    |
| `memory_sampling_stop`       | Stop memory sampling                       |
| `code_coverage_start`        | Start to collect code coverage data        |
| `code_coverage_stop`         | Stop code coevrage and send data           |
| `diagnosis_report`           | Run Node.js diagnosis report               |
| `memory_cpu_usage`           | Export CPU and memory info                 |

# Debug

Node-health's agent use debug module in order not to pollute your logs.
If you want to see all agent output just use DEBUG environment variable:

```console
DEBUG=node-health-agent* node myApp.js
```

# Test

```console
$ npm test
```

Coverage report can be found in coverage/.
