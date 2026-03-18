using UnityEngine;
using UnityEngine.InputSystem;

public class BoardController : MonoBehaviour
{
    [Header("Board Size")]
    public float width = 10f;
    public float height = 10f;

    [Header("Board Height (relativ zur Transform-Position)")]
    public float boardY = 0f;

    [Header("Grid Snap")]
    public bool useGrid = false;
    public float gridSize = 0.5f;

    [Header("Raycast Settings")]
    public LayerMask boardLayer;

    Camera mainCamera;

    void Awake()
    {
        mainCamera = Camera.main;
    }
    
    /// <summary>
    /// Raycast von einer Bildschirmposition auf das Board
    /// </summary>
    public bool TryGetBoardPosition(Vector2 screenPosition, out Vector3 position)
    {
        Ray ray = mainCamera.ScreenPointToRay(screenPosition);
        RaycastHit hit;

        if (Physics.Raycast(ray, out hit, 100f, boardLayer))
        {
            Debug.Log("Hit: " + hit.collider.name + " at " + hit.point);
            position = ClampPosition(hit.point);

            if (useGrid)
                position = SnapToGrid(position);

            return true;
        }

        Debug.Log("Raycast missed the board!");
        position = Vector3.zero;
        return false;
    }


    /// <summary>
    /// Begrenze Position auf Board
    /// </summary>
    public Vector3 ClampPosition(Vector3 worldPos)
    {
        Vector3 center = transform.position;
        float x = Mathf.Clamp(worldPos.x, center.x - width / 2f, center.x + width / 2f);
        float z = Mathf.Clamp(worldPos.z, center.z - height / 2f, center.z + height / 2f);

        return new Vector3(x, center.y + boardY, z);
    }

    /// <summary>
    /// Optionales Grid Snapping (relativ zur Board-Position)
    /// </summary>
    public Vector3 SnapToGrid(Vector3 pos)
    {
        Vector3 center = transform.position;
        pos.x = center.x + Mathf.Round((pos.x - center.x) / gridSize) * gridSize;
        pos.z = center.z + Mathf.Round((pos.z - center.z) / gridSize) * gridSize;

        return pos;
    }

    /// <summary>
    /// Visualisierung des Boards im Editor
    /// </summary>
    void OnDrawGizmos()
    {
        Gizmos.color = Color.green;

        Vector3 center = transform.position + new Vector3(0, boardY, 0);
        Vector3 size = new Vector3(width, 0.1f, height);

        Gizmos.DrawWireCube(center, size);
    }
}

