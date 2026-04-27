const fs = require('fs');

let code = fs.readFileSync('src/app/page.tsx', 'utf-8');
const searchStr = '{showAepExportModal && (() => {';
let startIdx = code.indexOf(searchStr);

if (startIdx === -1) {
  console.log('Modal not found');
  process.exit();
}

let endTarget = '})()}';
let targetOffset = code.indexOf(endTarget, startIdx);

while (targetOffset !== -1) {
  let lineEnd = code.indexOf('\n', targetOffset);
  let chunk = code.substring(startIdx, lineEnd + 1);

  let tempChunk = chunk;
  // Use a simple counting trick:
  // Since we know the modal has nested `{}` and ends with `})()}\n`
  // And we know there's no other crazy nesting inside the modal that would mismatch early.
  // Actually, we can just find the end index of the exact string `        );` \n `      })()}`
  
  if (chunk.includes('      })()}')) {
    let exactEnd = code.indexOf('})()}', targetOffset);
    if (exactEnd !== -1) {
       lineEnd = code.indexOf('\n', exactEnd);
       chunk = code.substring(startIdx, lineEnd + 1);
       
       let modalCode = chunk;
       console.log('Found modal length:', modalCode.length);
       
       // remove from old location
       code = code.substring(0, startIdx) + code.substring(lineEnd + 1);
       
       // locate DIRECTOR end
       let destStr = '  // EMPLOYEE PAGE';
       let destIdx = code.indexOf(destStr);
       
       let insertIdx = code.lastIndexOf('      </div>', destIdx);
       if (insertIdx !== -1) {
         code = code.substring(0, insertIdx) + modalCode + '\n' + code.substring(insertIdx);
         fs.writeFileSync('src/app/page.tsx', code);
         console.log('Moved!');
       } else {
         console.log('Could not find insert location!');
       }
       process.exit(0);
    }
  }
  
  targetOffset = code.indexOf(endTarget, targetOffset + 1);
}
