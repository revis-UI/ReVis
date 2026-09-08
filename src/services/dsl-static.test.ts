import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
it('supports session edits on a static host without probing nonexistent APIs',async()=>{
 vi.stubEnv('PROD',true);vi.stubEnv('VITE_DSL_API','false');vi.resetModules();
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const {loadDSLFile,saveDSLFile}=await import('./dsl');
 await expect(loadDSLFile('composite','case.json')).rejects.toThrow('bundled');
 const original=await loadDSLFile('basic_charts','01_simple_bar_chart.json');
 await saveDSLFile('basic_charts','01_simple_bar_chart.json',{...original.content as object,description:'demo edit'},original.hash);
 expect((await loadDSLFile<any>('basic_charts','01_simple_bar_chart.json')).content.description).toBe('demo edit');
 const payload={value:1},result=await saveDSLFile('composite','case.json',payload,null);
 payload.value=5;
 expect((await loadDSLFile('composite','case.json')).content).toEqual({value:1});
 await expect(saveDSLFile('composite','case.json',{},'old')).rejects.toMatchObject({status:409});
 await saveDSLFile('composite','case.json',{value:2},result.hash);
 expect(fetch).not.toHaveBeenCalled();
});
