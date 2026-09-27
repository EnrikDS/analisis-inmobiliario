"""Small GTFS fixture checks boarding stops regardless of destination and calendar."""
import importlib.util
import io
import sys
import unittest
from datetime import date
from pathlib import Path
from zipfile import ZipFile

path=Path(__file__).resolve().parents[1]/'scripts'/'import_buses.py'
spec=importlib.util.spec_from_file_location('import_buses',path)
bus=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bus)

class BusImporterTest(unittest.TestCase):
    def test_active_bus_boarding_stops_in_both_directions(self):
        output=io.BytesIO()
        with ZipFile(output,'w') as z:
            z.writestr('stops.txt','stop_id,stop_name,stop_lat,stop_lon\na,Alcala,40.482,-3.360\nb,Moncloa,40.434,-3.719\nc,Otro,40.48,-3.35\n')
            z.writestr('routes.txt','route_id,route_short_name,route_type\nr,223,3\ntrain,C1,2\n')
            z.writestr('calendar.txt','service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,0,0,20260901,20261031\n')
            z.writestr('trips.txt','route_id,service_id,trip_id\nr,s,in\nr,s,out\ntrain,s,rail\n')
            z.writestr('stop_times.txt','trip_id,arrival_time,departure_time,stop_id,stop_sequence\nin,08:00:00,08:00:00,a,1\nin,08:40:00,08:40:00,b,2\nout,09:00:00,09:00:00,b,1\nout,09:40:00,09:40:00,a,2\nrail,08:00:00,08:00:00,a,1\nrail,08:40:00,08:40:00,b,2\n')
        results=bus.extract(output.getvalue(),'fixture',date(2026,9,28),'fixture.zip')
        self.assertEqual(len(results['stops']),2)
        stop=next(s for s in results['stops'] if s['name']=='Alcala')
        self.assertEqual(stop['dailyTrips'],2)
        self.assertEqual(stop['examples'],['223'])
        self.assertEqual(results['source']['activeTrips'],2)

if __name__=='__main__': unittest.main()
