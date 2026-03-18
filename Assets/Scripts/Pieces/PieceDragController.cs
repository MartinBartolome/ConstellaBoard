using UnityEngine;
using UnityEngine.InputSystem;

public class PieceDragController : MonoBehaviour
{
    [Header("References")]
    public BoardController board;

    private Camera cam;
    private PersonPiece selectedPiece;
    private InputSystem_Actions inputActions;
    private Vector2 pointerPosition;

    void Awake()
    {
        inputActions = new InputSystem_Actions();
    }

    void Start()
    {
        cam = Camera.main;

        if (board == null)
            board = FindFirstObjectByType<BoardController>();

        if (cam == null)
            Debug.LogError("[PieceDragController] Keine Main Camera gefunden! Tag der Kamera muss 'MainCamera' sein.");
        if (board == null)
            Debug.LogError("[PieceDragController] Kein BoardController gefunden! Bitte im Inspector zuweisen oder BoardController zur Szene hinzufügen.");

        if (cam != null && board != null)
            Debug.Log("[PieceDragController] Start OK. Camera=" + cam.name + "  Board=" + board.name);
    }

    void OnEnable()
    {
        inputActions.Board.Enable();
        inputActions.Board.Click.started += OnClickStarted;
        inputActions.Board.Click.canceled += OnClickCanceled;
        inputActions.Board.PointerPosition.performed += OnPointerMoved;
    }

    void OnDisable()
    {
        inputActions.Board.Click.started -= OnClickStarted;
        inputActions.Board.Click.canceled -= OnClickCanceled;
        inputActions.Board.PointerPosition.performed -= OnPointerMoved;
        inputActions.Board.Disable();
    }

    void OnDestroy()
    {
        inputActions.Dispose();
    }

    private void OnPointerMoved(InputAction.CallbackContext ctx)
    {
        pointerPosition = ctx.ReadValue<Vector2>();
    }

    /// <summary>
    /// Selektion eines Pieces bei Klick/Touch.
    /// Nutzt RaycastAll, damit ein Board-Collider die Piece-Selektion nicht blockiert.
    /// </summary>
    private void OnClickStarted(InputAction.CallbackContext ctx)
    {
        if (cam == null || board == null)
            return;

        Debug.Log("[PieceDragController] Klick erkannt.");

        Ray ray = cam.ScreenPointToRay(pointerPosition);
        RaycastHit[] hits = Physics.RaycastAll(ray);
        System.Array.Sort(hits, (a, b) => a.distance.CompareTo(b.distance));

        if (hits.Length == 0)
        {
            Debug.LogWarning("[PieceDragController] Raycast trifft kein Objekt. Prüfe ob die Collider aktiviert sind.");
            return;
        }

        Debug.Log("[PieceDragController] Raycast trifft " + hits.Length + " Objekt(e):");
        foreach (RaycastHit hit in hits)
        {
            Debug.Log("  -> " + hit.collider.gameObject.name + "  Layer=" + LayerMask.LayerToName(hit.collider.gameObject.layer));
            // Suche PersonPiece von der Wurzel der Hierarchy aus (findet Parent, Sibling oder Child)
            PersonPiece piece = hit.collider.transform.root.GetComponentInChildren<PersonPiece>();
            if (piece != null)
            {
                selectedPiece = piece;
                selectedPiece.Select();
                Debug.Log("[PieceDragController] Piece ausgewählt: " + piece.personName);
                break;
            }
        }
    }

    /// <summary>
    /// Deselektion bei Maustaste/Finger loslassen
    /// </summary>
    private void OnClickCanceled(InputAction.CallbackContext ctx)
    {
        if (selectedPiece != null)
        {
            selectedPiece.Deselect();
            selectedPiece = null;
        }
    }

    /// <summary>
    /// Piece folgt dem Zeiger, solange gedrückt.
    /// Position wird auf das Board geclampt.
    /// </summary>
    void Update()
    {
        if (selectedPiece == null || cam == null || board == null)
            return;

        Ray ray = cam.ScreenPointToRay(pointerPosition);
        Plane plane = new Plane(Vector3.up, new Vector3(0f, board.transform.position.y + board.boardY, 0f));
        if (plane.Raycast(ray, out float enter))
        {
            Vector3 pos = ray.GetPoint(enter);
            pos = board.ClampPosition(pos);
            if (board.useGrid)
                pos = board.SnapToGrid(pos);
            selectedPiece.SetPosition(pos);
        }
    }
}

