const fs = require('fs')
// 用来 转AST
const parser = require('@babel/parser')
// 用来遍历AST 收集文件路径
const traverse = require('@babel/traverse').default
const path = require('path')
// es6 转es5
const babel = require('@babel/core')
// 代码中的依赖 即: 转化后add.js文件 min.js文件的内容  //TODO:
function getModuleInfo(file) {
    // 1.读取入口文件信息
    const body = fs.readFileSync(file, 'utf-8')
    // console.log(body);

    // 2. 转成AST树
    const ast = parser.parse(body, {
        sourceType: 'module'//表示我們要解析的是ES模块
    })
    // console.log(ast.program.body);

    // 3.遍历AST 收集依赖文件路径 存到deps对象中
    let deps = {}
    traverse(ast, {
        ImportDeclaration({ node }) {
            const dirname = path.dirname(file) //获取入口文件的路径
            const abspth = './' + path.join(dirname, node.source.value) // 路径拼接
            // 存
            deps[node.source.value] = abspth
        }
    })
    // console.log(deps);

    // 4.转ES5
    const { code } = babel.transformFromAst(ast, null, {
        presets: ["@babel/preset-env"]
    })
    // console.log(code);

    // 将我们返回了一个对象 ，
    // 这个对象包括该模块的路径（file），
    // 该模块的依赖（deps），
    // 该模块转化成es5的代码
    const moduleInfo = {
        file,
        deps,
        code
    }
    return moduleInfo
}
// getModuleInfo('./src/index.js')
// getModuleInfo()s该方法只能获取一个模块的的信息
// 5.递归getModuleInfo(),获取所有依赖
function parseModules(file) {
    const entry = getModuleInfo(file)
    const temp = [entry]
    // 格式化后的temp
    const depsGraph = {}
    // 循环入口文件的结果 获取deps 再不断推入依赖
    for (let i = 0; i < temp.length; i++) {
        const deps = temp[i].deps
        for (const key in deps) {
            // 如果依赖中有值 那么就推进temp数组
            if (deps.hasOwnProperty(key)) {
                temp.push(getModuleInfo(deps[key]))
            }
        }
    }
    // console.log(temp);
    // 整理temp的格式 以便后续
    temp.forEach(moduleInfo => {
        depsGraph[moduleInfo.file] = {
            deps: moduleInfo.deps,
            code: moduleInfo.code
        }
    });
    return depsGraph
}

// 6.处理两个关键字
parseModules('./src/index.js')
const bundle = (file) => {
    // 6.1将入口文件信息存起来
    const depsGraph = JSON.stringify(parseModules(file))

    return `(function (graph) {
        function require(file) {
            function absRequire(relPath) {
                return require(graph[file].deps[relPath])
            }
            var exports = {};
            (function (require,exports,code) {
                eval(code)
            })(absRequire,exports,graph[file].code);
            return exports
        }
        require('${file}')
    })(${depsGraph})`
}
const content= bundle('./src/index.js')

// 创建文件夹 
fs.mkdirSync('./dist');
//写入到我们的dist目录下
fs.writeFileSync('./dist/bundle.js',content)

/* TODO: 对最后一步骤的详细分析
 // 6.2传入一立即执行函数
 (function (graph) {
    let exports ={} // 6.6 执行依赖文件时又遇到exports 内容中它是个对象 所以要先定义它,以便在依赖中给它添加一些属性
    function require(file) {// 6.3 定义require函数
        function absPath(relPath){// 6.5 定义拦截，修改路径函数
        return require(graph[file].deps[relPath])
    }
        (function(require,exports,code){
            // 第一次执行(index.js)时发现代码中还有require,但是其中的路径并不是绝对路径，所以必须在调用require之前进行一次拦截，修改成绝对路径
            eval(code)
        })(absPath,exports,graph[file].code)
    }
    require(file)// 6.4 调用require函数 并传入依赖的内容信息
})(depsGraph)
*/