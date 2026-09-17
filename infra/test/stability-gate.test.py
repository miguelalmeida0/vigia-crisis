import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('acceptance_gate',Path(__file__).parents[2]/'scripts/release/acceptance-gate.py')
gate=importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
class StabilityGate(unittest.TestCase):
    def samples(self):
        return [dict(elapsed=i*30,bytes=240*gate.MIB,working_set=220*gate.MIB,limit=512*gate.MIB,oom_kill=0,identity='same-boot') for i in range(41)]
    def test_stable_whole_container_passes(self):
        self.assertEqual(gate.assess_memory(self.samples(),1200)['peak_container_mib'],240)
    def test_short_observation_cannot_certify(self):
        with self.assertRaisesRegex(ValueError,'insufficient'): gate.assess_memory(self.samples()[:12])
    def test_api_only_measurements_cannot_replace_cgroup_limit(self):
        s=self.samples();s[5]['limit']=1024*gate.MIB
        with self.assertRaises(ValueError):gate.assess_memory(s)
    def test_oom_is_failure(self):
        s=self.samples();s[-1]['oom_kill']=1
        with self.assertRaisesRegex(ValueError,'oom'):gate.assess_memory(s)
    def test_restart_is_failure(self):
        s=self.samples();s[-1]['identity']='different-boot'
        with self.assertRaisesRegex(ValueError,'restart'):gate.assess_memory(s)
    def test_growing_working_set_is_not_a_plateau(self):
        s=self.samples()
        for i,v in enumerate(s):v['working_set']+=i*gate.MIB
        with self.assertRaisesRegex(ValueError,'plateau'):gate.assess_memory(s)
    def test_headroom_is_required_even_without_oom(self):
        s=self.samples();s[25]['bytes']=495*gate.MIB
        with self.assertRaisesRegex(ValueError,'headroom'):gate.assess_memory(s)
if __name__=='__main__': unittest.main()
