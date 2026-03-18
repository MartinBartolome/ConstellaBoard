using UnityEngine;

public class NetworkManager : MonoBehaviour
{
    public static NetworkManager Instance;

    void Awake()
    {
        if (Instance != null)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
        DontDestroyOnLoad(gameObject);
    }
}
