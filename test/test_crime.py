"""Official INE crime series stays municipal and retains its unit and year."""
import importlib.util
import unittest
from pathlib import Path

path=Path(__file__).resolve().parents[1]/'scripts'/'refresh_crime.py'
spec=importlib.util.spec_from_file_location('refresh_crime',path)
crime=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crime)

class CrimeTest(unittest.TestCase):
    def test_real_rate_and_missing_municipality(self):
        csv=('Total Nacional;Municipios;Indicadores;Periodo;Total\n'
             'Total Nacional;Alcalá de Henares;Total infracciones penales (Tasa por mil habitantes);2024;""\n'
             'Total Nacional;Alcalá de Henares;Total infracciones penales (Tasa por mil habitantes);2023;48,76\n')
        geo={'places':[{'name':'Alcalá de Henares'},{'name':'Un pueblo sin dato'}],'meta':{'counts':{}}}
        result=crime.refresh(csv.encode(),geo)
        self.assertEqual(result['places'][0]['crime']['value'],48.76)
        self.assertEqual(result['places'][0]['crime']['period'],'2023')
        self.assertIsNone(result['places'][1]['crime'])
        self.assertEqual(result['meta']['counts']['crime'],1)

if __name__=='__main__': unittest.main()
