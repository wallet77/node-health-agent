const fs = require('fs')

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
                const file = `/${dir}/${subDir}/package.json`
                const json = require(`${file}`)
                const name = json.name
                const version = json.version
                packages[name] = version
            })
        } catch (err) {
            return packages
        }
        return packages
    }
}

module.exports = new Utils()
