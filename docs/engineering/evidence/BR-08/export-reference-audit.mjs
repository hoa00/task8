import ts from '/workspace/task8/node_modules/typescript/lib/typescript.js';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
const root='/workspace/task8/apps/api';
const walk = d => readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(/^(migrations|wu\d+|runtime)$/.test(e.name)?[]:walk(d+'/'+e.name)):/\.(ts|mjs)$/.test(e.name)?[d+'/'+e.name]:[]);
const files=[...walk(root+'/src'),...walk(root+'/tests/unit'),...walk(root+'/tests/integration'),...walk(root+'/tests/support'),...walk(root+'/scripts')];
const service=ts.createLanguageService({getScriptFileNames:()=>files,getScriptVersion:()=> '1',getScriptSnapshot:p=>existsSync(p)?ts.ScriptSnapshot.fromString(readFileSync(p,'utf8')):undefined,getCompilationSettings:()=>({target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,allowJs:true,resolveJsonModule:true}),getCurrentDirectory:()=>root,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory});
function relevant(ref){
 if(ref.isDefinition)return false;
 const source=service.getProgram().getSourceFile(ref.fileName);if(!source)return false;
 let found;
 const visit=n=>{if(n.pos<=ref.textSpan.start && n.end>=ref.textSpan.start){found=n;ts.forEachChild(n,visit);}};visit(source);
 for(let n=found;n;n=n.parent)if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))return false;
 return true;
}
const unused=[];
for(const file of files.filter(f=>f.includes('/src/'))){
 const ast=service.getProgram().getSourceFile(file);if(!ast)continue;
 for(const statement of ast.statements){
  if(!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  const names=ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement)?[statement.name]:ts.isVariableStatement(statement)?statement.declarationList.declarations.map(d=>d.name).filter(ts.isIdentifier):[];
  for(const name of names.filter(Boolean)){
   const groups=service.findReferences(file,name.getStart(ast))??[];
   if(!groups.some(g=>g.references.some(relevant)))unused.push({path:file.slice(root.length+1),name:name.text});
  }
 }
}
console.log(JSON.stringify(unused,null,2));
