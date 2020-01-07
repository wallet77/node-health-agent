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

# List of built-in events

| Event                        | description                                |
|:----------------------------:|:------------------------------------------:|
| `cpu_profiling_start`        | Start a CPU profiling                      |
| `cpu_profiling_stop`         | Stop a CPU profiling                       |
| `extract_env_var`            | Extract environment variables              |
| `extract_package_file`       | Extract package.json file content          |
| `extract_dependencies`       | Extract the full dependencies tree         |

# Test

```console
$ npm test
```

Coverage report can be found in coverage/.
