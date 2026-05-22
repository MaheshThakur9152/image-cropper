import unittest
from fastapi.testclient import TestClient
from app.main import app

class TestSidecar(unittest.TestCase):
  def setUp(self):
    self.client = TestClient(app)

  def test_health(self):
    response = self.client.get("/health")
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json(), {"status": "ok"})

  def test_slice_input_not_exists(self):
    # Test that requesting slice with non-existent input path returns 400
    payload = {
      "input_path": "d:/non_existent_folder_abc",
      "output_path": "d:/some_output",
      "height": 2000
    }
    response = self.client.post("/slice", json=payload)
    self.assertEqual(response.status_code, 400)
    self.assertIn("Input path does not exist", response.json()["detail"])

if __name__ == "__main__":
  unittest.main()
