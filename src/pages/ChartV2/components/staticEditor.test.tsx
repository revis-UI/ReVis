import {render,screen,waitFor,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
const ai=vi.hoisted(()=>({getConfig:vi.fn()}));
vi.mock('@/services/dsl',()=>({usesLocalDSLService:false,loadDSLFile:vi.fn(),saveDSLFile:vi.fn()}));
vi.mock('@/services/ai',()=>({aiClient:ai,AIServiceError:class extends Error{}}));
import {EditorAIController} from './EditorAIController';
afterEach(()=>cleanup());
it('keeps local history controls but disables unavailable AI without an API request',async()=>{
 render(<EditorAIController/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Open AI semantic editor'})).toBeDisabled());
 expect(screen.getByRole('status')).toHaveTextContent('separate backend');
 expect(screen.getByRole('button',{name:'Undo last edit'})).toBeInTheDocument();
 expect(ai.getConfig).not.toHaveBeenCalled();
});
