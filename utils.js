const fs = require('fs')
const debug = require('debug')
const error = debug('node-health-agent:error')
class Utils {
    extractDependencies (dir) {
        let packages = {}
        try {
            const subDirs = fs.readdirSync(dir)
            subDirs.forEach((subDir) => {
                if (subDir === '.bin') return
                if (subDir.indexOf('@') === 0) {
                    packages = { ...packages, ...this.extractDependencies(`${dir}/${subDir}`) }
                    return
                }

                // check for subdependencies inside node_modules folder
                packages = { ...packages, ...this.extractDependencies(`${dir}/${subDir}/node_modules`) }

                const file = `${dir}/${subDir}/package.json`
                const json = require(`${file}`)
                const name = json.name
                const data = {
                    parent: json._requiredBy,
                    version: json.version,
                    dependencies: json.dependencies
                }
                packages[name] = data
            })
        } catch (err) {
            return packages
        }

        return packages
    }

    extractPackageFile () {
        let data = {}
        try {
            data = require(`${__dirname}/../../package.json`)
        } catch (err) {
            error(err)
        }
        return data
    }
}

module.exports = new Utils()
