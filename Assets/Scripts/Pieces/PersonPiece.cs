using UnityEngine;

public class PersonPiece : MonoBehaviour
{
    [Header("Person Data")]
    public string personName;
    public PersonRole role;

    [Header("Visual")]
    public Renderer visualRenderer;

    [Header("Movement")]
    public bool isSelected = false;

    void Start()
    {
        ApplyRoleColor();
    }

    public void SetPosition(Vector3 position)
    {
        transform.position = position;
    }

    public void SetRotation(Vector3 direction)
    {
        if (direction != Vector3.zero)
        {
            transform.rotation = Quaternion.LookRotation(direction);
        }
    }

    public void Select()
    {
        isSelected = true;
        Highlight(true);
    }

    public void Deselect()
    {
        isSelected = false;
        Highlight(false);
    }

    void Highlight(bool active)
    {
        if (visualRenderer == null) return;

        if (active)
            visualRenderer.material.color *= 1.3f;
        else
            ApplyRoleColor();
    }

    void ApplyRoleColor()
    {
        if (visualRenderer == null) return;

        Color color = Color.gray;

        switch (role)
        {
            case PersonRole.Father:
                color = Color.blue;
                break;

            case PersonRole.Mother:
                color = Color.red;
                break;

            case PersonRole.Patient:
                color = Color.green;
                break;

            case PersonRole.Other:
                color = Color.gray;
                break;
        }

        visualRenderer.material.color = color;
    }
}

