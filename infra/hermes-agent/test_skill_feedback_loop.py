"""Actual installed Native loop, mock SDK HTTP only: ordinary skill errors remain correctable."""
import contextlib
import io
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch


@unittest.skipUnless(Path('/opt/hermes-agent/run_agent.py').is_file(), 'Requires the already installed Hermes runtime')
class NativeSkillFeedbackTests(unittest.TestCase):
    def test_actual_native_loop_corrects_unknown_namespace_and_reads_full_reference(self):
        with tempfile.TemporaryDirectory(prefix='native-skill-feedback-', dir=Path.cwd()) as directory:
            from install import write_science_skills
            home=Path(directory)
            source=Path(__file__).resolve().parents[2]
            write_science_skills(source,home/'skills',{'version':'fixture',
                'instructions':'Check quantities at their stated positions.',
                'sourceReviewInstructions':'Review the retained candidate against the original paper.'})
            reference='upstream/references/logical_fallacies.md'
            reference_text=(home/'skills'/'science'/'scientific-critical-thinking'/reference).read_text()
            environment={'HERMES_HOME':str(home),'HOME':str(home),'PATH':'/usr/bin:/bin',
                         'HERMES_TELEMETRY_ENABLED':'false','HERMES_NO_AUTO_UPDATE':'1'}
            calls=[];authorized=[];quiet=io.StringIO()
            with patch.dict(os.environ,environment,clear=True), contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
                sys.path.insert(0,'/opt/hermes-agent')
                import httpx
                from run_agent import AIAgent
                from tools.registry import registry
                from toolsets import create_custom_toolset
                from task_agent import SkillScope, create_task_agent_class, guard_registered_tools
                allowed={'skills_list','skill_view'}
                create_custom_toolset('openscience-feedback-test','Private native skill feedback test',tools=sorted(allowed))
                sequence=[('skill_view',{'name':'science:scientific-critical-thinking'}),('skills_list',{}),
                          ('skill_view',{'name':'scientific-critical-thinking'}),
                          ('skill_view',{'name':'scientific-critical-thinking','file_path':reference})]
                def response(request):
                    body=json.loads(request.content);ordinal=len(calls);calls.append(body)
                    if ordinal<len(sequence):
                        name,args=sequence[ordinal]
                        message={'role':'assistant','content':None,'tool_calls':[{'id':'feedback-'+str(ordinal),
                            'type':'function','function':{'name':name,'arguments':json.dumps(args)}}]}
                        reason='other' if ordinal==0 else 'tool_calls'
                    else:
                        self.assertEqual(ordinal,len(sequence))
                        message={'role':'assistant','content':'The method was loaded using its actual catalogue name.'};reason='stop'
                    return httpx.Response(200,json={'id':'native-feedback-'+str(ordinal),'object':'chat.completion',
                        'created':0,'model':'MiniMax-M3','choices':[{'index':0,'message':message,'finish_reason':reason}],
                        'usage':{'prompt_tokens':10,'completion_tokens':5,'total_tokens':15}})
                cls=create_task_agent_class(AIAgent,lambda:httpx.MockTransport(response),allowed)
                agent=cls(provider='openai',api_mode='chat_completions',model='MiniMax-M3',
                    api_key='offline-transport',base_url='http://openscience-worker/v1',max_iterations=6,max_tokens=2048,
                    enabled_toolsets=['openscience-feedback-test'],quiet_mode=True,save_trajectories=False,
                    persist_session=False,skip_memory=True,skip_context_files=True,session_id='native-feedback-test')
                guard_registered_tools(registry,allowed,lambda name,args:authorized.append((name,args)),SkillScope(home/'skills'))
                def no_network(*_args,**_kwargs):raise AssertionError('Offline fixture attempted external network')
                try:
                    with patch.object(socket.socket,'connect',no_network), patch.object(socket.socket,'connect_ex',no_network):
                        result=agent.run_conversation('Load the relevant method and its supporting reference.',
                            system_message='Use native skills and correct any selection error.',task_id='native-feedback-test')
                finally:agent.client.close()
                self.assertFalse(result.get('error'),result.get('error'))
                self.assertEqual(len(calls),5);self.assertEqual(len(authorized),4)
                results=[m for m in calls[-1]['messages'] if m.get('role')=='tool']
                self.assertFalse(json.loads(results[0]['content'])['success'])
                self.assertIn('skills_list',results[0]['content'])
                self.assertIn(reference,results[2]['content'])
                def strings(value):
                    if isinstance(value,str):yield value
                    elif isinstance(value,dict):
                        for child in value.values():yield from strings(child)
                    elif isinstance(value,list):
                        for child in value:yield from strings(child)
                self.assertGreater(len(reference_text),10_000)
                self.assertTrue(any(reference_text in value for value in strings(json.loads(results[3]['content']))))


if __name__=='__main__':unittest.main()
